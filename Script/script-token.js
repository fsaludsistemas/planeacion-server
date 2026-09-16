const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');
const { config } = require('dotenv');

config();

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/oauth2callback';
const CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.secret_client;

const SCOPES = [
	'https://www.googleapis.com/auth/drive',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('Faltan las credenciales OAuth Web.');
	console.error('Configura GOOGLE_WEB_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.');
	process.exit(1);
}

let redirectUrl;
try {
	redirectUrl = new URL(REDIRECT_URI);
} catch {
	console.error(`GOOGLE_REDIRECT_URI no es una URL valida: ${REDIRECT_URI}`);
	process.exit(1);
}

const PORT = Number(redirectUrl.port || 80);

if (redirectUrl.hostname !== 'localhost' || redirectUrl.pathname !== '/oauth2callback') {
	console.error('GOOGLE_REDIRECT_URI debe apuntar a http://localhost:<puerto>/oauth2callback.');
	process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
	CLIENT_ID,
	CLIENT_SECRET,
	REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
	access_type: 'offline',
	prompt: 'select_account',
	scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
	const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

	if (requestUrl.pathname !== redirectUrl.pathname) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Ruta no encontrada.');
		return;
	}

	const error = requestUrl.searchParams.get('error');
	const code = requestUrl.searchParams.get('code');

	if (error) {
		res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end('<h1>Autorizacion cancelada</h1><p>Puedes cerrar esta pestaña.</p>');
		console.error(`Google rechazo la autorizacion: ${error}`);
		server.close();
		return;
	}

	if (!code) {
		res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Falta el codigo de autorizacion.');
		return;
	}

	try {
		const { tokens } = await oauth2Client.getToken(code);

		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end('<h1>Autorizacion exitosa</h1><p>Puedes cerrar esta pestaña y volver a la terminal.</p>');

		if (!tokens.refresh_token) {
			console.error('Google no devolvio un refresh_token. Revoca el acceso anterior y ejecuta el script nuevamente.');
		} else {
			console.log('\nRefresh token obtenido. Guardalo en la columna USUARIOS.refresh_token:');
			console.log(tokens.refresh_token);
			console.log('\nNo lo compartas ni lo subas al repositorio.');
		}
	} catch (tokenError) {
		console.error('Error obteniendo los tokens:', tokenError.message);
		res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('No se pudo completar la autorizacion.');
	} finally {
		server.close();
	}
});

server.on('error', (error) => {
	if (error.code === 'EADDRINUSE') {
		console.error(`El puerto ${PORT} ya esta en uso. Configura otro con OAUTH_PORT.`);
	} else {
		console.error('No se pudo iniciar el callback OAuth:', error.message);
	}
	process.exitCode = 1;
});

server.listen(PORT, 'localhost', () => {
	console.log(`\nAbre esta URL con la cuenta administradora:\n\n${authUrl}\n`);
	console.log(`Esperando el callback en ${REDIRECT_URI} ...`);
});
