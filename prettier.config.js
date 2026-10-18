import nginxPlugin from 'prettier-plugin-nginx';

export default {
    plugins: [nginxPlugin],
    overrides: [
        {
            files: 'nginx.conf.example',
            options: {
                parser: 'nginx',
            },
        },
    ],
    singleQuote: true,
    tabWidth: 4,
    trailingComma: 'es5',
};
