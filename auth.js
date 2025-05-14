const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send('Autenticação necessária');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    const validUsername = process.env.APP_USERNAME;
    const validPassword = process.env.APP_PASSWORD;

    if (username === validUsername && password === validPassword) {
        return next();
    }

    res.status(401).send('Credenciais inválidas');
};

module.exports = basicAuth;