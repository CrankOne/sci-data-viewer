import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
    input: 'src/main.js',
    output: {
        file: 'app.js',
        format: 'module'
    },
    plugins: [nodeResolve()]
};
