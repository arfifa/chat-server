const router = require("express").Router();

const authRoute = require("./auth");
const userRoute = require("./user");

app.use("/auth", authRoute);
app.use("/user", userRoute);

module.exports = router;
