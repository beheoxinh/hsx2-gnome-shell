const cairo = imports.cairo;
const surface = new cairo.ImageSurface(cairo.Format.ARGB32, 100, 100);
const cr = new cairo.Context(surface);
cr.setFontSize(14);
let extents = cr.textExtents("A");
print("x_advance: " + extents.x_advance);
