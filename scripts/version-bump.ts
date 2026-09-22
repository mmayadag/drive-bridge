import man from '../manifest.json';
import pkg from '../packages/plugin/package.json';

pkg.version = man.version;

await Bun.write('packages/plugin/package.json', JSON.stringify(pkg, undefined, '\t'));

Bun.spawnSync({ cmd: ['bun', 'oxfmt', 'packages/plugin/package.json'] });
