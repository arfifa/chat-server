const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.CLIENT_ID_GOUTH,
  process.env.CLIENT_SECRET_GOUTH,
  "https://developers.google.com/oauthplayground"
);

const createTransporter = async () => {
  try {
    oauth2Client.setCredentials({
      refresh_token: process.env.REFRESH_TOKEN_GOUTH,
      access_token: process.env.ACCESS_TOKEN_GOUTH,
      scope: "https://www.googleapis.com/auth/gmail.send",
    });

    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          console.log("*ERR: ", err);
          reject();
        }
        resolve(token);
      });
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.USER_EMAIL,
        accessToken,
        clientId: process.env.CLIENT_ID_GOUTH,
        clientSecret: process.env.CLIENT_SECRET_GOUTH,
        refreshToken: process.env.REFRESH_TOKEN_GOUTH,
      },
    });
    return transporter;
  } catch (err) {
    return err;
  }
};

const sendGmail = async ({ to, sender, subject, html, attachments }) => {
  try {
    const from = sender || "xxx.gmail.com";

    const mailOptions = {
      to,
      from,
      subject,
      html,
      attachments,
    };

    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(mailOptions);
  } catch (error) {
    console.log(error);
  }
};

exports.sendMail = async (args) => {
  // if (process.env.NODE_ENV === "development") {
  //   return Promise.resolve();
  // } else {
  return sendGmail(args);
  // }
};
