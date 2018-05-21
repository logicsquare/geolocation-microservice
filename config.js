module.exports = {
  PORT: process.env.PORT || 3000,
  requireAuth: process.env.REQUIRE_AUTH || true,
  accessToken: process.env.ACCESS_TOKEN || "5c52033473c84e598f139ae462545595",
  jwtSecret: process.env.JWT_SECRET || "top secret",
  redisUrl: process.env.REDIS_URL || null,
  fayeMountPath: process.env.FAYE_MOUNT_PATH || "/faye",
  fayeTimeout: process.env.FAYE_TIMEOUT || 45
}