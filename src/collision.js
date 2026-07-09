export function didLand(playerX, platformX, radius) {
    return playerX >= platformX - radius && playerX <= platformX + radius;
}

export function didCollect(playerX, pickupX, radius) {
    return playerX >= pickupX - radius && playerX <= pickupX + radius;
}
