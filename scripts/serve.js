import express from 'express';
import nodeHttp from 'node:http';
import { isNativeError } from 'node:util';

const app = express();
const port = 3000;

function logHttpMethod(method) {
    return nodeHttp.METHODS.includes(method) ? method : 'UNKNOWN';
}

app.use((req, res, next) => {
    const started = Date.now();

    const method = logHttpMethod(req.method);
    const url = encodeURI(req.url);

    console.log(`--> ${method} ${url}`);

    res.on('finish', () => {
        console.log(
            `<-- ${method} ${url} ${res.statusCode} ${Date.now() - started}ms`
        );
    });

    res.on('close', () => {
        if (!res.writableFinished) {
            console.warn(`xxx ${method} ${url} connection closed early`);
        }
    });

    next();
});

app.use(express.static('./site'));

app.use((req, res) => {
    const method = logHttpMethod(req.method);
    const url = encodeURI(req.url);
    console.warn(`404 ${method} ${url}`);
    res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }

    const error = isNativeError(err)
        ? (err.stack ?? err.message)
        : 'Unknown error';
    console.error(error);
    res.status(500).send('Internal server error');
});

app.listen(port, () => {
    console.log(`Serving ./site at http://localhost:${port}`);
});
