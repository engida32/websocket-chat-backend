const connection = require("./utils/connection");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const cors = require("cors");
const WebSocket = require("ws");
//dotenv
require("dotenv").config();
const port = process.env.PORT || 3000;

const express = require("express");
const { upload } = require("./utils/storage");
const { Message } = require("./schema/message.schema");
const { User } = require("./schema/user.schema");
const app = express();
app.use(cors());
app.use(express.json());
// Middleware to serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Endpoint to upload files
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

// Registration endpoint
app.post("/register", async (req, res) => {
  console.log(req.body);
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword });
  try {
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(400).json({ error: "Username already exists" });
  }
});

// Login endpoint
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign(
      { userId: user._id, username },
      process.env.SECRET_KEY,
      {
        expiresIn: "2h",
      }
    );
    res.json({ token, username });
  } else {
    res.status(401).json({ error: "Invalid username or password" });
  }
});
app.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "username");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

//start server and websocket
const wss = new WebSocket.Server({
  server: app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  }),
});

// Websocket connection
wss.on("connection", async (ws, req) => {
  console.log("Client connected");
  // console.log(req.url, "req.query");
  const token = req.url.split("=")[1];
  // console.log(token, "token");
  try {
    const { userId } = jwt.verify(token, process.env.SECRET_KEY);
    const messages = await Message.find({
      sender: userId,
    }).populate("sender receiver");
    ws.send(JSON.stringify(messages));
  } catch (err) {
    ws.send(JSON.stringify({ error: "Authentication failed" }));
  }

  ws.on("message", async (data) => {
    const { token, receiverId, message, file } = JSON.parse(data);
    console.log(
      token,
      "token",
      receiverId,
      "receiverId",
      message,
      "message",
      file,
      "file"
    );
    try {
      const { userId: senderId } = jwt.verify(token, process.env.SECRET_KEY);
      console.log(senderId, "senderId");
      const newMessage = new Message({
        sender: senderId,
        receiver: receiverId,
        message,
        file: file || "",
      });
      await newMessage.save();
      // sort by latest message
      const messages = await Message.find({
        sender: senderId,
      })
        .populate("sender receiver")
        .sort({ createdAt: -1 });

      ws.send(JSON.stringify(messages));
    } catch (err) {
      ws.send(JSON.stringify({ error: "Authentication failed" }));
    }
  });
});
