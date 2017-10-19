const Express = require("express")
const Redis = require("redis")
const bodyParser = require("body-parser")
const { addMinutes } = require("date-fns")

const app = Express()
const redis = Redis.createClient()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())


app.post("/location", (req, res) => {
  const timeOutInMinutes = req.body.timeout || 10 // 10 mins is default
  const timeOutStamp = addMinutes(Date.now(), timeOutInMinutes).valueOf()
  if (!req.body.lng || !req.body.lat || !req.body.id) {
    return res.status(400).send("MISSING MANDATORY FIELDS IN REQUEST BODY")
  }
  console.log(req.body.lng, req.body.lat, req.body.id);
  redis.geoadd("driver:locations", req.body.lng, req.body.lat, `id:${req.body.id}`, (err) => {
    if (err) { return res.status(500).send("LOCATION NOT SAVED") }
    redis.zadd("drivers:activeuntill", timeOutStamp, `id:${req.body.id}`) // no waiting!!
    return res.status(200).send("OK")
  })
})

app.get("/near", (req, res) => {
  const myLat = req.query.lat
  const myLng = req.query.lng
  const radius = req.query.radius || 7 // eslint-disable-line prefer-destructuring
  const unit = req.query.unit || "km" // eslint-disable-line prefer-destructuring


  // First, find all inactive drivers:
  redis.zrangebyscore("drivers:activeuntill", "-inf", Date.now(), (err0, inactives) => {
    // Next, remove all those inactive drivers from geolocations
    redis.zrem("drivers:locations", ...inactives, (err1) => {
      if (err1) {
        console.log("ERR1: ", err1) // but don't stop execution!!
      }
      // ...And, for good measures, from the `activeuntill` zset as well
      redis.zremrangebyscore("drivers:activeuntill", "-inf", Date.now()) // but no waiting!!
      // Now the main task: geolocations!
      redis.georadius("driver:locations", myLng, myLat, radius, unit, (err2, locations) => {
        if (err2) {
          console.log("ERR1: ", err2.message)
          return res.status(500).send("COULD NOT FIND LOCATIONS")
        }
        console.log(locations)
        return res.json(locations)
      })
    })
  })
})

app.listen(3000, () => {
  console.log("Example app listening on port 3000!")
})
