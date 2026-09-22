import man from '../manifest.json';
import pkg from '../package.json';

pkg.version = man.version;

await Bun.write('package.json', `${JSON.stringify(pkg, undefined, '\t')}\n`);
