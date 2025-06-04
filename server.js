const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const fs = require('fs');
require('dotenv').config();

const app = express();
const helmet = require('helmet');
const { time } = require('console');
const e = require('express');
app.use(helmet());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SSH_CONFIG = {
	host: process.env.SERVER_IP || "127.0.0.1",
	port: process.env.SERVER_PORT || 22,
	username: 'game',
    privateKey: Buffer.from(process.env.KEY, 'base64').toString('utf-8')
};

const SSH_CONFIG_EN = {
	host: process.env.SERVER_IP || "127.0.0.1",
	port: process.env.SERVER_PORT || 22,
	username: 'gameEN',
    privateKey: Buffer.from(process.env.KEY, 'base64').toString('utf-8')
};

function isValidUUIDv4(uuid) {
	const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	return regex.test(uuid);
}

app.use(express.static('public'));
const ttoc = new Map();//token to connection
const ttoto = new Map();//token to timeout
const closetimeout = 1000 * 60 * 5; // 5分钟

function closeWs(token){
	if(!ttoc.has(token) || !ttoto.has(token)){
		return;
	}
	const {conn} = ttoc.get(token);	
	let {cnt, to} = ttoto.get(token);
	if(!conn || cnt === undefined || cnt === null){
		ttoc.delete(token);
		ttoto.delete(token);
		return;
	}
	cnt--;
	if(to !== false && cnt > 1){
		clearTimeout(to);
	}
	if(cnt <= 0){
		to = setTimeout(() => {
			if(!ttoc.has(token) || !ttoto.has(token)){
				return;
			}
			const {conn} = ttoc.get(token);	
			let {cnt, to} = ttoto.get(token);
			ttoc.delete(token);
			ttoto.delete(token);
			conn.end();
		}, closetimeout);
		cnt = 0;
	}
	ttoto.set(token, {cnt, to});
}

wss.on('connection', (ws) => {
	ws.on('message', (msg) => {
		try {
			const parsed = JSON.parse(msg);
			if (parsed.type === 'login' && parsed.token && isValidUUIDv4(parsed.token)) {
				const token = parsed.token;
				const EN = parsed.lang === 'EN';
				if(ttoc.has(token) && ttoto.has(token)){
					const {stream, conn} = ttoc.get(token);
					let {cnt, to} = ttoto.get(token);
					cnt++;
					if(to !== false && cnt > 1){
						clearTimeout(to);
					}
					ttoto.set(token, {cnt, to: false});
					stream.removeAllListeners('data');
					stream.removeAllListeners('exit');
					stream.removeAllListeners('close');
					ws.on('message', (msg) => {
						try {
							const parsed = JSON.parse(msg);
							if (parsed.type === 'resize' && stream) {
								stream.setWindow(parsed.rows, parsed.cols, 480, 640);
							} else if(parsed.type == 'input'){
								stream.write(parsed.data);
							}
						} catch (e) {
						}
					});
					stream.on('data', (data) => {
						ws.send(data);
					});
					stream.on('exit', (exitCode, signal) => {
						if (ws.readyState === WebSocket.OPEN) {
							const codeText = exitCode !== null && exitCode !== undefined ? exitCode : 'unknown';
							ws.send(`\r\n\x1b[31mssh connection closed\r\nexit code: ${codeText}\r\n\x1b[0m\r\n`);
							ws.close(1000, "ssh disconnected");
						}
					});
					// SSH shell关闭
					stream.on('close', () => {
						ttoc.delete(token);
						conn.end();
					});
					ws.on('close', () => {
						closeWs(token);
					});
					return;
				}
				const conn = new Client();
				conn.on('ready', () => {
					ws.send('\x1b[32mSSH connected\r\n\x1b[0m');
					conn.shell((err, stream) => {
						if (err) {
							ws.send(`\r\nSSH Shell Error: ${err.message}\r\n`);
							conn.end();
							return;
						}
						ttoc.set(token, {conn, stream});
						let {cnt, to} = (ttoto.has(token) ? ttoto.get(token) : {cnt: 0, to: null});
						cnt = 1;
						if(to !== false && cnt > 1){
							clearTimeout(to);
						}
						ttoto.set(token, {cnt, to: false});
						ws.on('message', (msg) => {
							try {
								const parsed = JSON.parse(msg);
								if (parsed.type === 'resize' && stream) {
									stream.setWindow(parsed.rows, parsed.cols, 480, 640);
								} else if(parsed.type == 'input'){
									stream.write(parsed.data);
								}
							} catch (e) {
							}
						});
						stream.on('data', (data) => {
							ws.send(data);
						});
						stream.on('exit', (exitCode, signal) => {
							if (ws.readyState === WebSocket.OPEN) {
								const codeText = exitCode !== null && exitCode !== undefined ? exitCode : 'unknown';
								ws.send(`\r\n\x1b[31mssh connection closed\r\nexit code: ${codeText}\r\n\x1b[0m\r\n`);
								ws.close(1000, "ssh disconnected");
							}
						});
						// SSH shell关闭
						stream.on('close', () => {
							ttoc.delete(token);
							conn.end();
						});
					});
				});

				if(EN){
					conn.connect(SSH_CONFIG_EN);
				}else{
					conn.connect(SSH_CONFIG);
				}

				ws.on('close', () => {
					closeWs(token);
				});
			}
		} catch (e) {
		}
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`服务器已启动：http://localhost:${PORT}`);
});
