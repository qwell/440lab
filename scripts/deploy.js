#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { domainToASCII, fileURLToPath } from 'node:url';

const domainPlaceholder = '<< DOMAIN >>';
const localhostCertificateDirectory = '/etc/nginx/ssl';
const localhostCertificate = path.join(
    localhostCertificateDirectory,
    'localhost.crt'
);
const localhostPrivateKey = path.join(
    localhostCertificateDirectory,
    'localhost.key'
);
const scriptFile = fileURLToPath(import.meta.url);
const projectDirectory = path.dirname(path.dirname(scriptFile));

function usage(stream = process.stdout) {
    stream.write(`Usage: yarn deploy [--http-only] [--no-www] HOST

Render and enable the NGINX configuration, then copy site files to its root.

Arguments:
  HOST         Domain name, IP address, or localhost.

Options:
  --http-only  Serve over HTTP without configuring a certificate. Implied for IPs.
  --no-www     Do not add a www alias or certificate name.
  -h, --help   Show this help.
`);
}

function normalizeHost(value) {
    // Remove trailing dots
    const normalizedValue = value.replace(/\.$/u, '').toLowerCase();

    if (isIP(normalizedValue)) {
        return normalizedValue;
    }

    const host = domainToASCII(normalizedValue);
    const labels = host.split('.');
    const invalidLabel = labels.some(
        (label) =>
            label.length === 0 ||
            label.length > 63 ||
            !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label)
    );

    if (
        !host ||
        host.length > 253 ||
        (host !== 'localhost' && labels.length < 2) ||
        invalidLabel
    ) {
        throw new Error(`Invalid host: ${value}`);
    }

    return host;
}

function parseArguments(arguments_) {
    let host;
    let httpOnly = false;
    let noWww = false;

    for (const argument of arguments_) {
        switch (argument) {
            case '--http-only':
                httpOnly = true;
                break;
            case '--no-www':
                noWww = true;
                break;
            case '-h':
            case '--help':
                return { help: true };
            default:
                if (argument.startsWith('-')) {
                    throw new Error(`Unknown option: ${argument}`);
                }

                if (host) {
                    throw new Error('Only one host may be specified.');
                }

                host = normalizeHost(argument);
        }
    }

    if (!host) {
        throw new Error('A host is required.');
    }

    // isIP() is poorly named, it isn't a bool.
    // It returns 0 for non-IPs, and 4 or 6 for their respective IP versions.
    const isIpAddress = !!isIP(host);

    return {
        host,
        help: false,
        httpOnly: httpOnly || isIpAddress,
        noWww:
            noWww ||
            isIpAddress ||
            host === 'localhost' ||
            host.startsWith('www.'),
    };
}

function renderConfiguration(template, host, noWww, httpOnly) {
    if (noWww) {
        template = template
            .replace(
                /^[\t ]*if \(\$host = www\.<< DOMAIN >>\) \{\r?\n(?:.*\r?\n)*?^[\t ]*\}/mu,
                ''
            )
            .replaceAll(' -d www.<< DOMAIN >>', '')
            .replaceAll(' www.<< DOMAIN >>', '');
    }

    template = template.replaceAll(domainPlaceholder, host);

    if (!httpOnly) {
        if (host === 'localhost') {
            template = template
                .replace(
                    '/etc/letsencrypt/live/localhost/fullchain.pem',
                    localhostCertificate
                )
                .replace(
                    '/etc/letsencrypt/live/localhost/privkey.pem',
                    localhostPrivateKey
                );
        }
    } else {
        template = template
            .replace(
                /^[\t ]*listen\s+443\s+ssl\s*;[^\r\n]*$/mu,
                '    listen 80;'
            )
            .replace(
                /^[\t ]*listen\s+\[::\]:443\s+ssl\s*;[^\r\n]*$/mu,
                '    listen [::]:80;'
            )
            .replace(/^[\t ]*ssl_certificate(?:_key)?\s+[^;]+;/gmu, '')
            .replace(
                /^[\t ]*return\s+301\s+https:\/\//mu,
                '        return 301 http://'
            )
            .replace(
                /^[\t ]*add_header\s+Strict-Transport-Security(?:(?!\s+always;)[\s\S])+\s+always;/mu,
                ''
            );

        const redirectMarker = '# HTTP-to-HTTPS redirect.';
        const redirectIndex = template.indexOf(redirectMarker);

        if (redirectIndex === -1) {
            throw new Error('The NGINX template has no HTTPS redirect marker.');
        }

        template = `${template.slice(0, redirectIndex).trimEnd()}\n`;
    }

    return template;
}

function configurationRoot(configuration) {
    const match = configuration.match(/^[\t ]*root[\t ]+([^;]+);/mu);

    if (!match) {
        throw new Error(
            'The rendered NGINX configuration has no root directive.'
        );
    }

    const root = match[1].trim();

    if (!path.isAbsolute(root)) {
        throw new Error(
            `The rendered NGINX root is not an absolute path: ${root}`
        );
    }

    return root;
}

function runAsRoot(host, noWww, httpOnly) {
    const arguments_ = [process.execPath, scriptFile];

    if (httpOnly) {
        arguments_.push('--http-only');
    }

    if (noWww) {
        arguments_.push('--no-www');
    }

    arguments_.push(host);

    console.log(`Deploying ${host}...`);
    const result = spawnSync('sudo', arguments_, { stdio: 'inherit' });

    if (result.error) {
        throw result.error;
    }

    if (result.signal) {
        throw new Error(`sudo terminated by signal ${result.signal}.`);
    }

    return result.status ?? 1;
}

async function replaceSymlink(target, link) {
    try {
        const status = await fs.lstat(link);

        if (!status.isSymbolicLink()) {
            throw new Error(`Refusing to replace non-symlink: ${link}`);
        }

        await fs.unlink(link);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    await fs.symlink(path.relative(path.dirname(link), target), link);
}

async function pathExists(file) {
    try {
        await fs.access(file);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

function ensureOpenSslInstalled() {
    const result = spawnSync('openssl', ['version'], { stdio: 'ignore' });

    if (result.error?.code === 'ENOENT') {
        throw new Error(
            'OpenSSL is not installed. Install it to generate the localhost server certificate.'
        );
    }

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`openssl version exited with status ${result.status}.`);
    }
}

async function ensureLocalhostCertificate() {
    ensureOpenSslInstalled();

    const certificateExists = await pathExists(localhostCertificate);
    const privateKeyExists = await pathExists(localhostPrivateKey);

    if (certificateExists && privateKeyExists) {
        return false;
    }

    if (certificateExists || privateKeyExists) {
        throw new Error(
            `Refusing to overwrite an incomplete certificate pair in ${localhostCertificateDirectory}`
        );
    }

    await fs.mkdir(localhostCertificateDirectory, {
        mode: 0o755,
        recursive: true,
    });

    const result = spawnSync(
        'openssl',
        [
            'req',
            '-x509',
            '-nodes',
            '-newkey',
            'rsa:2048',
            '-days',
            '3650',
            '-keyout',
            localhostPrivateKey,
            '-out',
            localhostCertificate,
            '-subj',
            '/CN=localhost',
            '-addext',
            'extendedKeyUsage=serverAuth',
            '-addext',
            'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
        ],
        { stdio: 'inherit' }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`openssl exited with status ${result.status}.`);
    }

    await fs.chmod(localhostCertificate, 0o644);
    await fs.chmod(localhostPrivateKey, 0o600);
    return true;
}

async function copySite(source, destination) {
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
        await fs.cp(
            path.join(source, entry.name),
            path.join(destination, entry.name),
            {
                force: true,
                preserveTimestamps: true,
                recursive: true,
            }
        );
    }
}

async function recreateSiteRoot(root) {
    const deploymentRoot = '/var/www';
    const relativeRoot = path.relative(deploymentRoot, root);

    if (
        !relativeRoot ||
        path.isAbsolute(relativeRoot) ||
        relativeRoot === '..' ||
        relativeRoot.startsWith(`..${path.sep}`)
    ) {
        throw new Error(
            `Refusing to replace a site directory outside ${deploymentRoot}: ${root}`
        );
    }

    await fs.rm(root, { force: true, recursive: true });
    await fs.mkdir(root, { mode: 0o755, recursive: true });
}

async function main() {
    const arguments_ = process.argv.slice(2);

    if (arguments_.length === 0) {
        usage();
        return 0;
    }

    let options;

    try {
        options = parseArguments(arguments_);
    } catch (error) {
        console.error(error.message);
        usage(process.stderr);
        return 2;
    }

    if (options.help) {
        usage();
        return 0;
    }

    const { host, httpOnly, noWww } = options;

    if (process.getuid?.() !== 0) {
        return runAsRoot(host, noWww, httpOnly);
    }

    const templateFile = path.join(projectDirectory, 'nginx.conf.example');
    const siteSource = path.join(projectDirectory, 'site');
    const nginxAvailable = '/etc/nginx/sites-available';
    const nginxEnabled = '/etc/nginx/sites-enabled';
    const nginxConfig = path.join(nginxAvailable, `${host}.conf`);
    const enabledConfig = path.join(nginxEnabled, `${host}.conf`);
    const template = await fs.readFile(templateFile, 'utf8');
    const configuration = renderConfiguration(template, host, noWww, httpOnly);
    const root = configurationRoot(configuration);
    const generatedLocalhostCertificate =
        host === 'localhost' &&
        !httpOnly &&
        (await ensureLocalhostCertificate());

    await fs.mkdir(nginxAvailable, { mode: 0o755, recursive: true });
    await fs.mkdir(nginxEnabled, { mode: 0o755, recursive: true });
    await recreateSiteRoot(root);
    await fs.writeFile(nginxConfig, configuration, { mode: 0o644 });
    await fs.chmod(nginxConfig, 0o644);
    await replaceSymlink(nginxConfig, enabledConfig);
    await copySite(siteSource, root);

    console.log(`Deployed NGINX configuration: ${nginxConfig}`);
    console.log(`Replaced site directory: ${root}`);

    if (httpOnly) {
        console.log(
            'Configured HTTP-only serving; no certificate is required.'
        );
        return 0;
    }

    if (host === 'localhost') {
        console.log(
            generatedLocalhostCertificate
                ? 'Generated a self-signed localhost TLS certificate.'
                : 'Using the existing localhost TLS certificate.'
        );
        console.log(`
localhost.crt is the self-signed TLS server certificate NGINX presents. It is
valid for server authentication, not client authentication. localhost.key is its
private key. Trust only localhost.crt locally to avoid browser warnings; keep
localhost.key on the server and never import it into a client or browser.

To trust the server certificate in the Debian/Ubuntu system store:
  sudo cp /etc/nginx/ssl/localhost.crt /usr/local/share/ca-certificates/localhost.crt
  sudo update-ca-certificates

On Windows, copy only localhost.crt locally, then run in PowerShell:
  Import-Certificate -FilePath .\\localhost.crt -CertStoreLocation Cert:\\CurrentUser\\Root

Chrome and Edge use the Windows trust store. Browsers such as Firefox may require
importing the public server certificate separately as a trusted authority.`);
        return 0;
    }

    console.log('\nNext, obtain the TLS certificate:');

    const domains = noWww ? `-d ${host}` : `-d ${host} -d www.${host}`;

    console.log(
        `sudo certbot certonly --standalone --cert-name ${host} ${domains} --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"`
    );

    return 0;
}

try {
    process.exitCode = await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    usage(process.stderr);
    process.exitCode = 1;
}
