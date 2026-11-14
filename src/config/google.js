const { google } = require('googleapis');
const { config } = require('dotenv');
config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents'];
const {
  client_id,
  client_secret,
  redirect_uris,
  api_key,
  client_email,
  private_key
} = process.env;
const authorize = () => {
  console.log(client_id, client_secret, redirect_uris, api_key);

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
  oAuth2Client.setCredentials({
    access_token: api_key,
    token_type: 'Bearer',
    expiry_date: 9999999999999,
  });

  return new Promise((resolve, reject) => {
    oAuth2Client.setCredentials({
      access_token: api_key,
      token_type: 'Bearer',
      expiry_date: 9999999999999,
    });
    resolve(oAuth2Client);
  });
};

// Limpiar saltos de línea escapados, retornos de carro de Windows y líneas vacías
const formattedKey = private_key
  ? private_key.replace(/\\n/g, '\n').replace(/\r/g, '').replace(/\n+/g, '\n').trim()
  : '';

const jwtClient = new google.auth.JWT(
  client_email,
  null,
  formattedKey,
  SCOPES
);

jwtClient.authorize(function (err, tokens) {
  if (err) {
    console.log(err);
    return;
  } else {
    console.log("Successfully connected!");
  }
});

module.exports = {
  SCOPES,
  authorize,
  jwtClient
};
