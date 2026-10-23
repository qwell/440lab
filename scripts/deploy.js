#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { domainToASCII, fileURLToPath } from 'node:url';

const hostPlaceholder = '<< HOST >>';
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

let noHttps = false;
let noWww = false;

function usage(stream = process.stdout) {
    stream.write(`Usage: yarn deploy [--no-https] [--no-www] [-d ALIAS]... HOST

Render and enable the NGINX configuration, then copy site files to its root.

Arguments:
  HOST         Hostname / domain, IP address, or localhost.

Options:
  --no-https   Serve over HTTP without configuring a certificate. Implied for IPs.
  --no-www     Do not add a www alias or certificate name.
  -d ALIAS     Add another host alias and certificate name. Repeatable; unavailable for localhost.
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
    if (arguments_.includes('-h') || arguments_.includes('--help')) {
        return { help: true };
    }

    const hostAliases = [];
    const hostArgument = arguments_.at(-1);
    if (!hostArgument || hostArgument.startsWith('-')) {
        throw new Error("missing required argument 'HOST'");
    }
    const host = normalizeHost(hostArgument);

    for (let index = 0; index < arguments_.length - 1; index += 1) {
        const argument = arguments_[index];
        switch (argument) {
            case '--no-https':
                noHttps = true;
                break;
            case '--no-www':
                noWww = true;
                break;
            case '-d': {
                const alias = arguments_[index + 1];
                if (
                    index + 1 >= arguments_.length - 1 ||
                    alias.startsWith('-')
                ) {
                    throw new Error('A alias is required after -d.');
                }

                const normalizedAlias = normalizeHost(alias);
                if (isIP(normalizedAlias) || normalizedAlias === 'localhost') {
                    throw new Error(`Invalid host alias: ${alias}`);
                }
                hostAliases.push(normalizedAlias);
                index += 1;
                break;
            }
            default:
                if (argument.startsWith('-')) {
                    throw new Error(`Unknown option: ${argument}`);
                }

                throw new Error('Host must be the final argument.');
        }
    }
    if (host === 'localhost' && hostAliases.length) {
        throw new Error('-d cannot be used with localhost.');
    }

    // isIP() is poorly named, it isn't a bool.
    // It returns 0 for non-IPs, and 4 or 6 for their respective IP versions.
    const isIpAddress = !!isIP(host);
    noHttps ||= isIpAddress;
    noWww ||= isIpAddress || host === 'localhost' || host.startsWith('www.');

    return {
        hostAliases: [
            ...new Set(hostAliases.filter((alias) => alias !== host)),
        ],
        host,
        help: false,
        httpOnly: noHttps,
        noWww,
    };
}

function deploymentHosts(host, hostAliases) {
    return [
        ...new Set([host, ...(noWww ? [] : [`www.${host}`]), ...hostAliases]),
    ];
}

function markedSection(template, name) {
    const markerName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const marker = (position) =>
        new RegExp(
            `^[\\t ]*#[\\t ]*${position} ${markerName}\\.[\\t ]*$`,
            'mu'
        );
    const startMarker = marker('BEGIN').exec(template);
    const markerEnd = startMarker
        ? template.indexOf('\n', startMarker.index)
        : -1;
    const endMarker = marker('END').exec(template.slice(markerEnd + 1));
    if (!startMarker || markerEnd === -1 || !endMarker) {
        throw new Error(`The NGINX template has no ${name} section.`);
    }
    return {
        contentStart: markerEnd + 1,
        end: markerEnd + 1 + endMarker.index,
    };
}

function enableMarkedSection(template, name) {
    const { contentStart, end } = markedSection(template, name);
    const content = template
        .slice(contentStart, end)
        .replace(/^(?:[\t ]+#[\t ]?|#)/gmu, '');
    return `${template.slice(0, contentStart)}${content}${template.slice(end)}`;
}

function serverNameDirectives(hosts) {
    return hosts.map((host) => `    server_name ${host};`).join('\n');
}

function addServerNames(template, hosts) {
    const rendered = template.replace(
        /^server \{(\r?\n)/mu,
        `server {$1${serverNameDirectives(hosts)}$1$1`
    );
    if (rendered === template) {
        throw new Error('The NGINX template has no active server block.');
    }
    return rendered;
}

function enableRedirectServer(template, name, hosts) {
    const enabled = enableMarkedSection(template, name);
    const { contentStart, end } = markedSection(enabled, name);
    const content = addServerNames(enabled.slice(contentStart, end), hosts);
    return `${enabled.slice(0, contentStart)}${content}${enabled.slice(end)}`;
}

function renderConfiguration(template, host, hostAliases, httpOnly) {
    const hosts = deploymentHosts(host, hostAliases);
    const aliases = hosts.slice(1);
    const certificateHosts = hosts.map((host) => `-d ${host}`).join(' ');

    template = template.replace(
        '-d << HOST >> -d www.<< HOST >>',
        certificateHosts
    );

    if (httpOnly) {
        template = addServerNames(template, [host]);
        template = enableMarkedSection(template, 'HTTP settings');
        if (aliases.length) {
            template = enableRedirectServer(
                template,
                'HTTP-only aliases redirect',
                aliases
            );
        }
    } else {
        template = addServerNames(template, [host]);
        template = enableMarkedSection(template, 'HTTPS settings');
        template = enableRedirectServer(
            template,
            'Canonical HTTP-to-HTTPS redirect',
            hosts
        );
        if (aliases.length) {
            template = enableRedirectServer(
                template,
                'HTTPS aliases redirect',
                aliases
            );
        }
    }

    template = template.replaceAll(hostPlaceholder, host);

    if (!httpOnly && host === 'localhost') {
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

    template = template
        .replace(/^[\t ]*#.*(?:\r?\n|$)/gmu, '')
        .replace(/(?:\r?\n[\t ]*){3,}/gu, '\n\n')
        .trim();

    return `${template}\n`;
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

function runAsRoot(host, hostAliases, httpOnly) {
    const arguments_ = [process.execPath, scriptFile];

    if (httpOnly) {
        arguments_.push('--no-https');
    }

    if (noWww) {
        arguments_.push('--no-www');
    }

    for (const alias of hostAliases) {
        arguments_.push('-d', alias);
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

    const { hostAliases, host, httpOnly } = options;

    if (process.getuid?.() !== 0) {
        return runAsRoot(host, hostAliases, httpOnly);
    }

    const templateFile = path.join(projectDirectory, 'nginx.conf.example');
    const siteSource = path.join(projectDirectory, 'site');
    const nginxAvailable = '/etc/nginx/sites-available';
    const nginxEnabled = '/etc/nginx/sites-enabled';
    const nginxConfig = path.join(nginxAvailable, `${host}.conf`);
    const enabledConfig = path.join(nginxEnabled, `${host}.conf`);
    const template = await fs.readFile(templateFile, 'utf8');
    const configuration = renderConfiguration(
        template,
        host,
        hostAliases,
        httpOnly
    );
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

    const hostArguments = deploymentHosts(host, hostAliases)
        .map((alias) => `-d ${alias}`)
        .join(' ');

    console.log(
        `sudo certbot certonly --standalone --cert-name ${host} ${hostArguments} --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"`
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
