const cairo = imports.cairo;
const surface = new cairo.ImageSurface(cairo.Format.ARGB32, 400, 400);
const cr = new cairo.Context(surface);

cr.setSourceRGB(0, 0, 0);
cr.paint();

let xc = 200;
let yc = 200;
let r = 100;
let thickness = 20;
let fontsize = 14;

// Draw arc
cr.setLineWidth(thickness);
cr.setSourceRGB(0, 0.5, 0);
cr.arc(xc, yc, r, -Math.PI/2, Math.PI);
cr.stroke();

cr.setSourceRGB(1, 1, 1);
cr.setFontSize(fontsize);
let text = "WannaBeTheGuy used 544.6GB/1000.0G (50%)";

let startAngle = -Math.PI / 2;
let textAngle = startAngle + 0.05;

for (let i = 0; i < text.length; i++) {
    let char = text[i];
    let extents = cr.textExtents(char);
    let charWidth = extents.xAdvance;
    if (charWidth === 0 && char === ' ') {
        charWidth = extents.width || (fontsize * 0.4);
    }
    
    let charAngle = charWidth / r;
    
    cr.save();
    cr.translate(xc, yc);
    cr.rotate(textAngle + charAngle/2 + Math.PI/2);
    cr.translate(0, -r);
    
    // baseline offset
    cr.moveTo(-charWidth/2, fontsize * 0.3);
    cr.showText(char);
    cr.restore();
    
    textAngle += charAngle;
}

surface.writeToPNG("test_curved.png");
