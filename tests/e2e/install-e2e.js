import Gio from 'gi://Gio';
const Sync = await import(`file://${ARGV[0]}/nautilusSync.js`);
const r = Sync.install(Gio.File.new_for_path(ARGV[0]));
print(`install: written=${r.written.length} errors=${r.errors.join(';')} dir=${Sync.targetDir().get_path()}`);
