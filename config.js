module.exports = {
  PORT: process.env.PORT || 3000,
  requireAuth: process.env.REQUIRE_AUTH || false,
  jwtSecret: process.env.JWT_SECRET || "top secret",
  redisUrl: process.env.REDIS_URL || null,
  fayeMountPath: process.env.FAYE_MOUNT_PATH || "/faye",
  fayeTimeout: process.env.FAYE_TIMEOUT || 45
}