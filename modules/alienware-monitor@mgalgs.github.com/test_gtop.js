const GTop = imports.gi.GTop;
let gtop = new GTop.glibtop_fsusage();
GTop.glibtop_get_fsusage(gtop, "/");
print("block_size: " + gtop.block_size);
print("blocks: " + gtop.blocks);
print("bfree: " + gtop.bfree);
print("bavail: " + gtop.bavail);
print("read: " + gtop.read);
