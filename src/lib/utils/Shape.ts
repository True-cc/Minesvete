import { inverseAngle, toDeg, wrapAngle, approx } from "./Math";
import { equals } from "./ObjectUtils";
import type { Grid, Point } from "./Grid";
import Vec from "./Vec";

export function moveShapePoint(shapePoint: ShapePoint, point: Point) {
    shapePoint.x = point.x;
    shapePoint.y = point.y;
    return shapePoint;
}

export interface ShapePoint extends Point {
    move: boolean;
    toString: (grid: Grid) => string;
}

class LTP implements ShapePoint {
    public x: number;
    public y: number;
    public move: boolean = false;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public toString(grid: Grid) {
        const { x, y } = grid.applyToVector(grid.toVector(this.x, this.y));
        return `L ${x},${y}`;
    }
}

class MTP implements ShapePoint {
    public x: number;
    public y: number;
    public move: boolean = true;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public toString(grid: Grid) {
        const { x, y } = grid.applyToVector(grid.toVector(this.x, this.y));
        return `M ${x},${y}`;
    }
}

export function lineTo(x: number, y: number) {
    return lineToPoint({ x, y });
}

export function lineToPoint(point: Point): ShapePoint {
    return new LTP(point.x, point.y);
};

export function moveTo(x: number, y: number) {
    return moveToPoint({ x, y });
}

export function moveToPoint(point: Point): ShapePoint {
    return new MTP(point.x, point.y);
}

export class ShapeInfo {
    public get isRevealed(): boolean {
        return this._isRevealed;
    }
    public set isRevealed(value: boolean) {
        this._isRevealed = value;
        this.callback(this);
    }
    public get isFlagged(): boolean {
        return this._isFlagged && !this.isRevealed;
    }
    public set isFlagged(value: boolean) {
        if (this.isRevealed) { return; }
        this._isFlagged = value;
        this.callback(this);
    }
    public get hasMine(): boolean {
        return this._hasMine;
    }
    public set hasMine(value: boolean) {
        this._hasMine = value;
        this.callback(this);
    }
    public get color(): string {
        return this._color;
    }
    public set color(value: string) {
        this._color = value;
        this.callback(this);
    }
    constructor(
        private _color: string = "default",
        private _hasMine: boolean = false,
        private _isFlagged: boolean = false,
        private _isRevealed: boolean = false,
        public callback: (info: ShapeInfo) => void = () => { },
    ) {
    }

    public getState(hovering: boolean): string {
        if (this.isRevealed) {
            if (this.hasMine) {
                return "exploded";
            }
            return "revealed";
        }
        if (this.isFlagged) {
            return "flagged";
        }
        if (hovering) {
            return "hovering";
        }
        return "normal";
    }
}

export class Shape {
    public contacts: Shape[] = [];
    public callback: (shape: Shape) => void = () => { };
    public readonly shapeInfo: ShapeInfo = new ShapeInfo()
    constructor(public readonly grid: Grid, public readonly points: ShapePoint[], hasMine: boolean = false) {
        this.shapeInfo.hasMine = hasMine;
        this.shapeInfo.callback = () => this.callback(this);
    }

    public get lines(): Line[] {
        var lines: Line[] = [];
        var first: ShapePoint = this.points[0];
        var prev: ShapePoint = this.points[0];
        for (let i = 1; i < this.points.length; i++) {
            const p = this.points[i];
            if (p.move) {
                lines.push(new Line(this.grid, prev, first));
                first = p;
            } else {
                lines.push(new Line(this.grid, p, prev));
            }
            prev = p;
        }
        lines.push(new Line(this.grid, prev, first));
        return lines;
    }
    public get number() {
        return this.contacts.filter(s => s.shapeInfo.hasMine).length;
    }
    private uptadingContacts: boolean = false;

    updateContacts() {
        if (this.uptadingContacts) {
            return;
        }
        this.uptadingContacts = true;
        var prevContacts = this._updateContacts();
        this.contacts.forEach(s => s._updateContacts());
        prevContacts.forEach(s => s._updateContacts());
        this.uptadingContacts = false;
    }

    _updateContacts() {
        var prevContacts = this.contacts;
        this.contacts = this.grid.info.shapes.filter(s => s !== this && this.isCorner(s));
        this.callback(this);
        return prevContacts.filter(s => !this.contacts.includes(s));
    }

    reveal() {
        if (this.shapeInfo.isRevealed) return;
        this.shapeInfo.isRevealed = true;
        if (!this.shapeInfo.hasMine && this.number === 0) {
            this.contacts.forEach(s => s.reveal());
        }
        this.callback(this);
    }

    isAdjacent(other: Shape) {
        return this._isAdjacent(this.lines, other.lines);
    }

    isCorner(other: Shape) { // includes adjacent
        const otherPoints = other.getPoints();
        return this.getPoints().some(p => otherPoints.some(p2 => p.x === p2.x && p.y === p2.y));
        // return this._isCorner(this.lines, other.lines);
    }

    _isAdjacent(self: Line[], them: Line[]) {
        return self.some(l1 => them.some(l2 => {
            if (!(approx(l2.rotation, l1.rotation) || approx(l2.rotation, inverseAngle(l1.rotation)))) {
                return false;
            }
            const points1 = this.grid.getAllInLinePoint(l1.p1, l1.p2);
            const points2 = this.grid.getAllInLinePoint(l2.p1, l2.p2);
            let found = false;
            return points1.some(p => points2.some(p2 => {
                if (equals(p, p2)) {
                    if (found) {
                        return true;
                    }
                    found = true;
                }
            }))
        }))
    }

    // _isCorner(self: Line[], them: Line[]) {
    //     return self.some(l1 => {
    //         const points = this.grid.getAllInLinePoint(l1.p1, l1.p2);
    //         return them.some(l2 => points.some(p => equals(p, l2.p1) || equals(p, l2.p2)))
    //     }) || them.some(l1 => {
    //         const points = this.grid.getAllInLinePoint(l1.p1, l1.p2);
    //         return self.some(l2 => points.some(p => equals(p, l2.p1) || equals(p, l2.p2)))
    //     });
    // }

    getPoints() {
        var points: Point[] = [];
        const lines = this.lines;
        for (let i = 0; i < lines.length; i++) {
            const element = lines[i];
            points.push(...this.grid.getAllInLinePoint(element.p1, element.p2));
        }
        return points;
    }

    getCenter() {
        var center = { x: this.points[0].x, y: this.points[0].y }
        for (let i = 1; i < this.points.length; i++) {
            var p = this.points[i];
            center.x += p.x;
            center.y += p.y;
        }
        center.x /= this.points.length;
        center.y /= this.points.length;
        return center;
    }

    toString() {
        return this.points.map(p => (p.move ? 'z ' : '') + p.toString(this.grid)).join(' ').slice(2) + ' z';
    }
}

export class Line {
    public readonly v1: Vec;
    public readonly v2: Vec;
    constructor(public readonly grid: Grid, public readonly p1: Point, public readonly p2: Point) {
        this.v1 = new Vec(p1.x, p1.y);
        this.v2 = new Vec(p2.x, p2.y);
    }

    public get dx(): number {
        return this.p2.x - this.p1.x;
    }

    public get dy(): number {
        return this.p2.y - this.p1.y;
    }

    public get rotation(): number {
        return wrapAngle(toDeg(Math.atan2(this.dy, this.dx)));
    }

    public get sizeSq(): number {
        return this.v2.distanceSq(this.v1);
    }
}