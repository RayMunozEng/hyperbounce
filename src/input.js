export class InputController {
    constructor(doc = document) {
        this.document = doc;
        this.active = false;
        this.movementX = 0;
        this.onMouseMove = this.onMouseMove.bind(this);
    }

    start(canvas) {
        if (this.active) return;
        this.active = true;
        this.document.addEventListener("mousemove", this.onMouseMove, false);
        this.hideCursor();
        if (canvas) this.lock(canvas);
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        this.movementX = 0;
        this.document.removeEventListener("mousemove", this.onMouseMove, false);
        this.unlock();
        this.showCursor();
    }

    lock(canvas) {
        const lock = canvas.requestPointerLock ||
            canvas.mozRequestPointerLock ||
            canvas.webkitRequestPointerLock;

        try {
            const result = lock ? lock.call(canvas) : null;

            if (result && result.catch) {
                result.catch((error) => {
                    this.pointerLockError = error;
                });
            }
        } catch (error) {
            this.pointerLockError = error;
        }
    }

    unlock() {
        const unlock = this.document.exitPointerLock ||
            this.document.mozExitPointerLock ||
            this.document.webkitExitPointerLock;

        if (unlock) unlock.call(this.document);
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
}
