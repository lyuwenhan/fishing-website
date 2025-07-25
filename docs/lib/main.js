if(window.localStorage.getItem("ag") !== "true"){
	if(!/^\/disclaimer\/?$/.test(location.pathname)){
		location.href = 'disclaimer.html';
	}
}else (function (){
	const url = new URL(window.location.href);
	const lang = url.searchParams.get("lang") || '';
	const langup = lang.toUpperCase();
	const isENG = ["EN", 'ENGLISH', "EN-US", "EN-US.UTF-8", "EN.UTF-8"];
	if(isENG.includes(langup)){
		if(lang !== "EN"){
			url.searchParams.set("lang", "EN");
			window.location.replace(url.toString());
			throw new Error("Launguage not correct");
		}
	}else if(lang){
		url.searchParams.delete("lang");
		window.location.replace(url.toString());
		throw new Error("Launguage not correct");
	}
	const fontSize = window.innerWidth < 768 ? 12 : 18;
	const term = new Terminal({
		fontSize: fontSize,
		cursorBlink: true,
		fontFamily: 'Consolas, Courier, monospace',
		theme: {
			background: "#4E0E3B",
			foreground: "#FFFFFF",
			cursor: "#EEEEEC",
			selection: "#FFFFFF",

			black: "#2E3436",
			red: "#CC0000",
			green: "#4E9A06",
			yellow: "#C4A000",
			blue: "#3465A4",
			magenta: "#75507B",
			cyan: "#06989A",
			white: "#D3D7CF",

			brightBlack: "#555753",
			brightRed: "#EF2929",
			brightGreen: "#8AE234",
			brightYellow: "#FCE94F",
			brightBlue: "#729FCF",
			brightMagenta: "#AD7FA8",
			brightCyan: "#34E2E2",
			brightWhite: "#EEEEEC"
		}
	});

	const terminal = document.getElementById('terminal');

	term.open(terminal);
	const fitAddon = new window.FitAddon.FitAddon();
	term.loadAddon(fitAddon);

	fitAddon.fit();
	term.focus();

	window.addEventListener('resize', () => {
		fitAddon.fit();
	});

	function send(cols, rows){
		if(term.tiot){
			clearTimeout(term.tiot);
			term.tiot = setTimeout(()=>{
				send(cols, rows)
				term.tiot = null;
			}, 100);
		}else{
			socket.send(JSON.stringify({type: 'resize', cols, rows}));
			term.tiot = setTimeout(()=>{term.tiot = null}, 100);
		}
	}

	var socket = null;
	const token = uuid.v4();
	let socketConnected = 0;

	function connect(){
		if(socketConnected === 1){
			return;
		}
		if(socket){
			if(socket.readyState === WebSocket.OPEN){
				socket.close();
			}
			if(socket.readyState === WebSocket.CONNECTING){
				socket.onopen = ()=>socket.close();
			}
			socket.onmessage = null;
			socket.onclose = null;
			socket.onerror = null;
			socket = null;
		}
		socketConnected = 0;
		socket = new WebSocket(`wss://wh-fi.duckdns.org:8501`);

		socket.onopen = () => {
			socketConnected = 1;
			socket.send(JSON.stringify({type: 'login', token, lang}));
			const { cols, rows } = term;
			socket.send(JSON.stringify({type: 'resize', cols, rows}));
			term.onResize(({cols, rows}) => {
				setTimeout(()=>{send(cols, rows)},100);
			});
			term.writeln("\x1b[32mWeb Socket connected.\x1b[0m");
		};

		socket.onmessage = (event) => {
			if(typeof event.data === "string"){
				// 文本消息直接写入终端
				term.write(event.data);
			}else if(event.data instanceof Blob){
				// Blob转ArrayBuffer再写入
				const reader = new FileReader();
				reader.onload = () => {
					const data = new Uint8Array(reader.result);
					term.write(data);
				};
				reader.readAsArrayBuffer(event.data);
			}else if(event.data instanceof ArrayBuffer){
				// 直接写入
				term.write(new Uint8Array(event.data));
			}else{
				// 其他情况，尝试转字符串写入
				term.write(String(event.data));
			}
		};

		socket.onclose = () => {
			socketConnected = 2;
			term.writeln("\r\n\x1b[31mWeb Socket disconnected\r\npress enter to refresh\x1b[0m");
		};
	}

	connect();

	function fullscreen(){
		if(document.fullscreenElement){
			document.exitFullscreen();
		}else{
			terminal.requestFullscreen();
		}
	}
	window.addEventListener("keydown", (e) => {
		if(e.repeat){
			return;
		}

		if(e.code === 'F11'){
			e.stopPropagation();
			e.preventDefault();
			fullscreen();
		}

		if((e.ctrlKey && e.code === 'KeyR') || e.code === 'F5'){
			e.stopPropagation();
			// e.preventDefault();
			// location.reload();
		}
		if(socketConnected === 2 && e.code === 'Enter'){
			connect();
			e.preventDefault();
			e.stopPropagation();
		}
		if(e.ctrlKey && e.shiftKey && e.code === 'KeyC'){
			e.preventDefault();
			e.stopPropagation();

			const selection = term.getSelection();
			if(selection && selection.toString().length > 0){
				navigator.clipboard.writeText(selection).then(() => term.clearSelection());
				term.clearSelection();
			}
		}
		if(e.ctrlKey && e.shiftKey && e.code === 'KeyV'){
			e.preventDefault();
			e.stopPropagation();
			term.clearSelection();
			navigator.clipboard.readText().then(data => socket.send(JSON.stringify({ type: 'input', data })));
		}
	}, true);


	window.addEventListener("keyup", (e) => {
		if((e.ctrlKey && e.key.toLowerCase() === 'r') || e.key === 'F5'){
			e.stopPropagation();
		}
		if(socketConnected === 2 && e.code === 'Enter'){
			e.preventDefault();
			e.stopPropagation();
		}
		if(e.ctrlKey && e.shiftKey && e.code === 'KeyC'){
			e.preventDefault();
			e.stopPropagation();
		}
		if(e.ctrlKey && e.shiftKey && e.code === 'KeyV'){
			e.preventDefault();
			e.stopPropagation();
		}
		if(e.code === 'F11'){
			e.stopPropagation();
			e.stopPropagation();
		}
	}, true);

	function tryFocusTerminal(e){
		const ignored = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
		if(ignored.includes(e.target.tagName)) return;
		if(document.activeElement !== term.textarea){
			setTimeout(() => term.focus(), 0);
		}
	}
	document.addEventListener('click', tryFocusTerminal, true);
	term.textarea.addEventListener('blur', () => {
		setTimeout(() => {
			if(document.activeElement !== term.textarea){
				term.focus();
			}
		}, 0);
	}, true);

	term.onData((data) => {
		socket.send(JSON.stringify({type: 'input', data}));
	});

	terminal.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		const selection = term.getSelection();
		if(selection){
			if(selection.toString().length > 0){
				navigator.clipboard.writeText(selection).then(()=>term.clearSelection());
			}else{
				term.clearSelection();
			}
		}else{
			navigator.clipboard.readText().then(data=>socket.send(JSON.stringify({type: 'input', data})));
		}
	});

	const fullele = document.getElementById("full"), unfullele = document.getElementById("unfull");

	fullele.addEventListener("click", () => {
		fullscreen();
	});

	unfullele.addEventListener("click", () => {
		fullscreen();
	});
	document.addEventListener('fullscreenchange', () => {
		if(document.fullscreenElement){
			fullele.style.display = "none";
			unfullele.style.display = "block";
		}else{
			fullele.style.display = "block";
			unfullele.style.display = "none";
		}
	});
})();
