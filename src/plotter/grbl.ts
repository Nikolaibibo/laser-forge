import { PlotterPort } from "./webserial";
import { DEFAULT_PEN, type PenOpts } from "./gcode";

export class Grbl {
  constructor(
    public port: PlotterPort,
    public pen: PenOpts = DEFAULT_PEN,
  ) {}

  unlock(): Promise<string> {
    return this.port.send("$X");
  }

  status(): Promise<string> {
    return this.port.send("?");
  }

  async setOrigin(): Promise<string> {
    await this.port.send("G90");
    return this.port.send("G92 X0 Y0");
  }

  async penUp(): Promise<string> {
    await this.port.send(this.pen.penUp);
    return this.port.send(`G4 P${this.pen.dwellUp}`);
  }

  async penDown(): Promise<string> {
    await this.port.send(this.pen.penDown);
    return this.port.send(`G4 P${this.pen.dwellDown}`);
  }

  async jog(dx: number, dy: number, feed = 3000): Promise<string> {
    await this.port.send("G91");
    await this.port.send(`G1 X${dx} Y${dy} F${feed}`);
    return this.port.send("G90");
  }

  async park(): Promise<string> {
    await this.penUp();
    return this.port.send("G0 X0 Y0");
  }
}
