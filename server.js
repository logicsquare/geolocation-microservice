const Redis = require("redis")
const { addMinutes } = require("date-fns")

const http = require("http")
const url = require("url")
const Faye = require("faye")

const config = require("./config.js")

const redis = Redis.createClient(config.redisUrl)

const server = http.createServer((req, res) => {
  const { query } = url.parse(req.url, true)
  const myLat = parseFloat(query.lat)
  const myLng = parseFloat(query.lng)
  const radius = Number(query.radius) || 7 // eslint-disable-line prefer-destructuring
  const unit = query.unit || "km" // eslint-disable-line prefer-destructuring

  // console.log("**********", myLat, myLng, radius, unit)
  if (!myLat || !myLng) {
    res.writeHead(400)
    return res.end("MISSING MANDATORY FIELDS `lat` & `lng`")
    // return res.end(400).send("MISSING MANDATORY FIELDS `lat` & `lng`")
  }

  // First, find all inactive :
  return redis.zrangebyscore("driver:activeuntill", "-inf", Date.now(), (err0, inactives) => {
    // console.log("Inactives: ", inactives)
    // Next, remove all those inactive  from geolocations
    redis.zrem("driver:locations", ...inactives, (err1) => {
      if (err1) {
        // Note: it WIIL throw an error if there are no inactive drivers (ERR: wrong no of args for ZREM)...
        // console.log("ERR1: ", err1) // ...but don't stop execution for that!!
      }
      // ...And, for good measures, from the `activeuntill` zset as well
      redis.zremrangebyscore("driver:activeuntill", "-inf", Date.now()) // but no waiting!!
      // Now the main task: geolocations!
      redis.georadius("driver:locations", myLng, myLat, radius, unit, "WITHCOORD", "ASC", (err2, locations) => {
        if (err2) {
          // console.log("ERR1: ", err2.message)
          res.writeHead(500)
          return res.end("COULD NOT FIND LOCATIONS")
        }
        // console.log("Nearby Locations: ", locations)
        res.writeHead(200)
        return res.end(JSON.stringify(locations.map(l => ({
          id: l[0].split(":")[1],
          lng: l[1][0],
          lat: l[1][1]
        }))))
      })
    })
  })
})

/** Realtime stuff */
const bayeux = new Faye.NodeAdapter({ mount: config.fayeMountPath, timeout: config.fayeTimeout })
bayeux.attach(server)

bayeux.getClient()
  .subscribe("/location/*")
  .withChannel((channel, data) => {
    const id = channel.split("/")[2]
    // console.log("FAYE: Rcvd location udpate msg........", id, data)
    if (id && data.lng && data.lat) {
      redis.geoadd("driver:locations", data.lng, data.lat, `id:${id}`)
      // Also, publish a Heartbeat!
      bayeux.getClient().publish(`/heartbeat/${id}`, { serverClient: true, timestamp: Date.now() })
    }
  })

bayeux.getClient()
  .subscribe("/heartbeat/*")
  .withChannel((channel, data) => {
    const id = channel.split("/")[2]
    // console.log("FAYE: Rcvd hearbeat msg......", id, data)
    if (id) {
      const timeOutInMinutes = 10 // time outs after minimum 10 mins of inactivity
      const timeOutStamp = addMinutes(Date.now(), timeOutInMinutes).valueOf()
      redis.zadd("driver:activeuntill", timeOutStamp, `id:${id}`)
    }
  })


server.listen(config.PORT)
