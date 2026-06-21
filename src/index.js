import express from 'express';
import {matchRouter} from "./routes/matches.js";
import http from "http";
import {attachWebSocketServer} from "./ws/server.js";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0'

const app = express();
const server = http.createServer(app)

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: "Welcome to the Sportz API!" });
});

app.use('/api/matches', matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server)
app.locals.broadcastMatchCreated = broadcastMatchCreated

server.listen(PORT, HOST , () => {
    const baseURL = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`
    console.log('Starting server...');
    setTimeout(() => {
        console.log(`Server is running on ${baseURL}`);
        console.log(`WebSocket Server is running on ${baseURL.replace('http', 'ws')}/ws`);
    }, 1000);
});