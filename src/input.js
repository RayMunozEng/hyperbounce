export class InputController {
    constructor(doc = document) {
        this.document = doc;
        this.active = false;
        this.movementX = 0;
        this.onMouseMove = this.onMouseMove.bind(this);
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.document.addEventListener("mousemove", this.onMouseMove, false);
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        this.movementX = 0;
        this.document.removeEventListener("mousemove", this.onMouseMove, false);
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
