// oxlint-disable no-console
// Fails when versions.json has no entry for the manifest version, or a different
// minAppVersion. The Obsidian community store reads versions.json to decide which
// release an older Obsidian can install.

import man from '../manifest.json';
import versions from '../versions.json';

const listed = (versions as Record<string, string>)[man.version];
if (listed !== man.minAppVersion) {
	console.error(
		`versions.json maps ${man.version} to ${listed ?? 'nothing'}, manifest.json says minAppVersion ${man.minAppVersion}.`,
	);
	process.exit(1);
}
console.log(`versions.json: ${man.version} → ${listed}`);
