const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SG_KEY);

const sendSGMail = async ({ to, sender, subject, html, attachments }) => {
  try {
    const from = sender || "xxx.gmail.com";

    const msg = {
      to,
      from,
      subject,
      html,
      attachments,
    };

    return sgMail.send(msg);
  } catch (error) {
    console.log(error);
  }
};

exports.sendMail = async (args) => {
  if (process.env.NODE_ENV === "development") {
    return new Promise.resolve();
  } else {
    return sendSGMail(args);
  }
};
