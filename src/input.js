const POINTER_LOCK_CHANGE_EVENTS = [
    "pointerlockchange",
    "mozpointerlockchange",
    "webkitpointerlockchange"
];
const POINTER_LOCK_METHODS = [
    "requestPointerLock",
    "mozRequestPointerLock",
    "webkitRequestPointerLock"
];

function getPointerLockMethod(target) {
    if (!target) return null;

    return POINTER_LOCK_METHODS.find((methodName) => typeof target[methodName] === "function");
}

export class InputController {
    constructor(doc = document) {
        this.document = doc;
        this.active = false;
        this.movementX = 0;
        this.canvas = null;
        this.lockTarget = null;
        this.pointerLockError = null;
        this.pointerLockUnavailable = false;
        this.pointerReleasedByEscape = false;
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    start(canvas) {
        this.canvas = canvas || this.canvas;

        if (this.active) {
            this.pointerReleasedByEscape = false;
            this.capturePointer();
            return;
        }

        this.active = true;
        this.pointerReleasedByEscape = false;
        this.document.addEventListener("mousemove", this.onMouseMove, false);
        this.document.addEventListener("pointerdown", this.onPointerDown, false);
        this.document.addEventListener("keydown", this.onKeyDown, false);
        this.addPointerLockListeners();
        this.hideCursor();
        this.capturePointer();
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        this.movementX = 0;
        this.pointerReleasedByEscape = false;
        this.lockTarget = null;
        this.document.removeEventListener("mousemove", this.onMouseMove, false);
        this.document.removeEventListener("pointerdown", this.onPointerDown, false);
        this.document.removeEventListener("keydown", this.onKeyDown, false);
        this.removePointerLockListeners();
        this.unlock();
        this.showCursor();
        this.canvas = null;
    }

    lock(canvas) {
        const target = this.resolveLockTarget(canvas);
        const lockMethod = getPointerLockMethod(target);

        if (!target || !lockMethod) {
            this.lockTarget = null;
            this.pointerLockUnavailable = true;
            this.pointerLockError = {
                name: "PointerLockUnavailable",
                message: "Pointer lock is not available in this browser surface."
            };
            return;
        }

        this.lockTarget = target;
        this.pointerLockUnavailable = false;

        try {
            const result = target[lockMethod].call(target);

            if (result && result.catch) {
                result.catch((error) => {
                    this.pointerLockError = error;
                });
            }
        } catch (error) {
            this.pointerLockError = error;
        }
    }

    resolveLockTarget(canvas) {
        return [
            canvas,
            this.document.body,
            this.document.documentElement
        ].find((target) => getPointerLockMethod(target));
    }

    unlock() {
        const unlock = this.document.exitPointerLock ||
            this.document.mozExitPointerLock ||
            this.document.webkitExitPointerLock;

        if (unlock) unlock.call(this.document);
    }

    capturePointer() {
        if (this.pointerReleasedByEscape) return;
        if (!this.canvas || this.isPointerLocked()) return;
        this.hideCursor();
        this.lock(this.canvas);
    }

    addPointerLockListeners() {
        POINTER_LOCK_CHANGE_EVENTS.forEach((eventName) => {
            this.document.addEventListener(eventName, this.onPointerLockChange, false);
        });
    }

    removePointerLockListeners() {
        POINTER_LOCK_CHANGE_EVENTS.forEach((eventName) => {
            this.document.removeEventListener(eventName, this.onPointerLockChange, false);
        });
    }

    isPointerLocked() {
        const target = this.lockTarget || this.canvas;

        return this.document.pointerLockElement === target ||
            this.document.mozPointerLockElement === target ||
            this.document.webkitPointerLockElement === target ||
            this.document.pointerLockElement === this.canvas ||
            this.document.mozPointerLockElement === this.canvas ||
            this.document.webkitPointerLockElement === this.canvas;
    }

    hideCursor() {
        const body = this.document.body;
        if (!body) return;

        if (body.classList) {
            body.classList.add("is-playing");
        } else if (body.style) {
            body.style.cursor = "none";
        }
    }

    showCursor() {
        const body = this.document.body;
        if (!body) return;

        if (body.classList) {
            body.classList.remove("is-playing");
        } else if (body.style) {
            body.style.cursor = "";
        }
    }

    consumeMovement() {
        const movement = this.movementX;
        this.movementX = 0;
        return movement;
    }

    onMouseMove(event) {
        if (!this.active) return;
        if (event.preventDefault) event.preventDefault();
        this.movementX += event.movementX || 0;
    }

    onPointerDown(event) {
        if (!this.active) return;
        if (event.button && event.button !== 0) return;
        this.pointerReleasedByEscape = false;
        this.capturePointer();
    }

    onPointerLockChange() {
        if (!this.active || this.isPointerLocked()) return;
        this.capturePointer();
    }

    onKeyDown(event) {
        if (!this.active || event.key !== "Escape") return;

        if (event.preventDefault) event.preventDefault();
        this.pointerReleasedByEscape = true;
        this.movementX = 0;
        this.unlock();
        this.showCursor();
    }
}
