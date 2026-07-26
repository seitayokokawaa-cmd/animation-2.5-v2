declare module 'harfbuzzjs' {
  export class Blob {
    constructor(data: Uint8Array);
  }
  export class Face {
    constructor(blob: Blob, index?: number);
    readonly upem: number;
  }
  export class Font {
    constructor(face: Face);
    glyphToPath(glyphId: number): string;
  }
  export class Buffer {
    addText(text: string): void;
    guessSegmentProperties(): void;
    getGlyphInfosAndPositions(): {
      codepoint: number;
      xAdvance?: number;
      yAdvance?: number;
      xOffset?: number;
      yOffset?: number;
    }[];
  }
  export function shape(font: Font, buffer: Buffer): void;
}
