const Express = require("express")
const Redis = require("redis")
const bodyParser = require("body-parser")
const { addMinutes } = require("date-fns")

const http = require("http")
const Faye = require("faye")

const app = Express()
const redis = Redis.createClient()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(Express.static(`${__dirname}/public`))

const server = http.createServer(app)
const bayeux = new Faye.NodeAdapter({ mount: "/faye", timeout: 45 })
bayeux.attach(server)

bayeux.getClient()
  .subscribe("/location/*")
  .withChannel((channel, data) => {
    const id = channel.split("/")[2]
    console.log("FAYE: Rcvd location udpate msg........", id, data);
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
    console.log("FAYE: Rcvd hearbeat msg......", id, data);
    if (id) {
      const timeOutInMinutes = 10 // time outs after minimum 10 mins of inactivity
      const timeOutStamp = addMinutes(Date.now(), timeOutInMinutes).valueOf()
      redis.zadd("driver:activeuntill", timeOutStamp, `id:${id}`)
    }
  })

app.post("/location", (req, res) => {
  const timeOutInMinutes = req.body.timeout || 10 // minimum 10 mins is default
  const timeOutStamp = addMinutes(Date.now(), timeOutInMinutes).valueOf()
  if (!req.body.lng || !req.body.lat || !req.body.id) {
    return res.status(400).send("MISSING MANDATORY FIELDS IN REQUEST BODY")
  }
  console.log(req.body.lng, req.body.lat, req.body.id)
  redis.geoadd("driver:locations", req.body.lng, req.body.lat, `id:${req.body.id}`, (err) => {
    if (err) { return res.status(500).send("LOCATION NOT SAVED") }
    redis.zadd("driver:activeuntill", timeOutStamp, `id:${req.body.id}`) // no waiting!!
    return res.status(200).send("OK")
  })
})

app.get("/near", (req, res) => {
  const myLat = req.query.lat
  const myLng = req.query.lng
  const radius = req.query.radius || 7 // eslint-disable-line prefer-destructuring
  const unit = req.query.unit || "km" // eslint-disable-line prefer-destructuring


  // First, find all inactive :
  redis.zrangebyscore("driver:activeuntill", "-inf", Date.now(), (err0, inactives) => {
    console.log("Inactives: ", inactives)
    // Next, remove all those inactive  from geolocations
    redis.zrem("driver:locations", ...inactives, (err1) => {
      if (err1) {
        // Note: it WIIL throw an error if there are no inactive drivers (ERR: wrong no of args for ZREM)...
        console.log("ERR1: ", err1) // ...but don't stop execution for that!!
      }
      // ...And, for good measures, from the `activeuntill` zset as well
      redis.zremrangebyscore("driver:activeuntill", "-inf", Date.now()) // but no waiting!!
      // Now the main task: geolocations!
      redis.georadius("driver:locations", myLng, myLat, radius, unit, (err2, locations) => {
        if (err2) {
          console.log("ERR1: ", err2.message)
          return res.status(500).send("COULD NOT FIND LOCATIONS")
        }
        console.log("Nearby Locations: ", locations)
        return res.json(locations)
      })
    })
  })
})

server.listen(3000, () => {
  console.log("Example app listening on port 3000!")
})
