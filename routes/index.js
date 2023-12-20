const router = require("express").Router();

const authRoute = require("./auth");

app.use("/auth", authRoute);

module.exports = router;
