const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");
const { promisify } = require("util");
//
const User = require("../models/user");
const filterObj = require("../utils/filterObj");
const mailService = require("../services/mailer");

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

// FLOW FEATURE
// Signup => register - sendOTP - verifyOTP

// Register New User
exports.register = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "LastName",
    "password",
    "email"
  );

  // check if verified user with given email exists
  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already in use, Please login.",
    });
  } else if (existing_user) {
    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    // generate OTP and send email to user
    req.userId = existing_user._id;
    next();
  } else {
    // if user record is not available in DB
    const new_user = await User.create(filteredBody);

    // generate OTP and send email to user
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000;

  await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time,
  });

  // TODO => Send Mail
  mailService.sendMail({
    to: "example@gmail.com",
    sender: "contact@codingmonk.com",
    subject: "OTP for Tawk",
    html: `<p>Your OTP is ${new_otp}. This is valid for 10 Mins.</p>`,
    attachments: [],
  });

  res.status(200).json({
    status: "success",
    message: "OTP Sent Successfully",
  });
};

exports.verifyOTP = async (req, res, next) => {
  // verify OTP and update user record accordingly
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is Invalid or OTP expired",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    return res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  //OTP is correct
  user.verified = true;
  user.otp = undefined;

  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);
  res.status(200).json({
    status: "success",
    message: "OTP verified successfully!",
    token,
  });
};

// User Login
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });

    return;
  }

  const userDoc = await User.findOne({ email: email }).select("+password");

  if (!userDoc) {
    res.status(400).json({
      status: "error",
      message: "Email is incorect",
    });

    return;
  }

  if (!(await userDoc.correctPassword(password, userDoc.password))) {
    res.status(400).json({
      status: "error",
      message: "Password is incorect",
    });

    return;
  }

  const token = signToken(userDoc._id);
  res.status(200).json({
    status: "success",
    message: "Logged is successfully",
    token,
  });
};

exports.protect = async (req, res, next) => {
  // 1) Getting token (JWT) and check if it's there
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    req.status(400).json({
      status: "error",
      message: "You are not Logged In! Please log in to get access",
    });

    return;
  }

  // 2) verification of token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exist
  const this_user = await User.findById(decoded.userId);

  if (!this_user) {
    return res.status(400).json({
      status: "error",
      message: "The user doesn't exist",
    });
  }

  // 4) check if user changed their password after token was issued
  if (this_user.changedPasswordAfter(decoded.iat)) {
    return res.status(400).json({
      status: "error",
      message: "User recently updated password! Please log in again",
    });
  }

  req.user = this_user;
  next();
};

exports.forgotPassword = async (req, res, next) => {
  // 1) Get users by email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    res.status(400).json({
      status: "error",
      message: "There is no user with given email address",
    });

    return;
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();

  const resetURL = `https://tawk.com/auth/reset-password/?code${resetToken}`;

  try {
    // TODO => Send Email With Reset URL

    res.status(200).json({
      status: "success",
      message: "Reset Password link sent to Email",
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpired = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email, Please try again later.",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  const { password, passwordConfirm } = req.body;
  // 1) Get user based on token

  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpired: { $gt: Date.now() },
  });

  // 2) if token has expired or submission is out of time window
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Token is Invalid or Expried",
    });

    return;
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({
      status: "error",
      message: "Password and Password Confirm is do not match!",
    });
  }

  // 3) Update users password and set resetToken & expiry to undefined
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpired = undefined;

  await user.save();

  // 4) Log in the user and Send new JWT

  // TODO => send an email to user informing about password

  const token = signToken(user._id);
  res.status(200).json({
    status: "success",
    message: "Password Reseted successfully",
    token,
  });
};
