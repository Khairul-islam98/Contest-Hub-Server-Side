const express = require('express');
const app = express();
require('dotenv').config()
const cors = require('cors');
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5001


// middlware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://assignment-12-dfc40.web.app',
        'https://contest-hub.netlify.app'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());






const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.clvlvsk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db("contestHubDb").collection("users");
        const contestsCollection = client.db("contestHubDb").collection("contests");
        const bookingsCollection = client.db("contestHubDb").collection("bookings");

        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
              return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
              if (err) {
                return res.status(401).send({ message: 'unauthorized access' })
              }
              req.decoded = decoded;
              next();
            })
          }
      

        const verifyAdmin = async (req, res, next) => {
            const user = req.user
            console.log('user from verify admin', user)
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            if (!result || result?.role !== 'admin')
                return res.status(401).send({ message: 'unauthorized access' })
            next()
        }

        const verifyCreator = async (req, res, next) => {
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            if (!result || result?.role !== 'creator')
                return res.status(401).send({ message: 'unauthorized access' })
            next()
        }

        app.post('/jwt', async (req, res) => {
            const user = req.body
            console.log('I need a new jwt', user)
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })




        app.put('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email: email }
            const options = { upsert: true }
            const isExist = await usersCollection.findOne(query)
            console.log('User found?----->', isExist)
            if (isExist) {
                if (user?.status === 'Requested') {
                    const result = await usersCollection.updateOne(
                        query,
                        {
                            $set: user,
                        },
                        options
                    )
                    return res.send(result)
                } else {
                    return res.send(isExist)
                }
            }
            const result = await usersCollection.updateOne(
                query,
                {
                    $set: { ...user, timestamp: Date.now() },
                },
                options
            )
            res.send(result)
        })
       
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })
        
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        // Update user role
        app.put('/users/update/:email',  async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timestamp: Date.now(),
                },
            }
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        app.post('/contests',  async (req, res) => {
            const contest = req.body
            const result = await contestsCollection.insertOne(contest)
            res.send(result)
        })
        app.get('/contests', async (req, res) => {
            const result = await contestsCollection.find().toArray()
            res.send(result)
        })
        app.get("/contests/search", async (req, res) => {
            const searchTerm = req.query.searchTerm;
            try {
                const result = await contestsCollection.find({
                    contestname: { $regex: searchTerm, $options: 'i' }
                }).toArray();
                res.json(result);
            } catch (error) {
                console.error('Error searching contests:', error);
                res.status(500).json({ message: 'Error searching contests' });
            }
        });

        app.get('/contests/approved', async (req, res) => {
            const page = parseInt(req.query.page)
            const size = parseInt(req.query.size)
            let quary = {}
            const result = await contestsCollection.find({ status: 'Accepted' }, quary)
                .skip(page * size)
                .limit(size)
                .toArray()
            res.send(result)
        })
        app.get('/contestsCount', async (req, res) => {
            const count = await contestsCollection.estimatedDocumentCount();
            res.send({ count })
        })

        app.get('/contests/:id', async (req, res) => {
            const id = req.params.id
            const result = await contestsCollection.findOne({ _id: new ObjectId(id) })
            res.send(result)
        })

        app.get('/contests/creator/:email',  async (req, res) => {
            const email = req.params.email
            const result = await contestsCollection
                .find({ 'creator.email': email })
                .toArray()
            res.send(result)
        })


        app.put('/contests/:id',  async (req, res) => {
            const contest = req.body
            console.log(contest)

            const filter = { _id: new ObjectId(req.params.id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: contest,
            }
            const result = await contestsCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })



        app.put('/contests/accept/:id', async (req, res) => {
            const id = req.params.id
            const status = req.body
            const query = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...status,
                },
            }
            const result = await contestsCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        app.put('/contests/attempt/:id', async (req, res) => {
            try {
                const contestId = req.params.id;

                const filter = { _id: new ObjectId(contestId) };
                const contest = await contestsCollection.findOne(filter);
                const update = { $inc: { participantsCount: 1 } };

                const result = await contestsCollection.updateOne(filter, update);
            } catch (error) {
                console.error('Error during attempt:', error);
                res.status(500).json({ message: 'Error during attempt' });
            }
        });
       

        app.get('/contests/popular/data', async (req, res) => {
            try {
                const popularContests = await contestsCollection
                    .find({}, {
                        _id: 1,
                        contestname: 1,
                        image: 1,
                        participantsCount: 1,
                        description: 1,
                        winner: 1,
                    })
                    .sort({ participantsCount: -1 })
                    .limit(5)
                    .toArray();

                const formattedResponse = popularContests.map(contest => ({
                    contestname: contest.contestname,
                    image: contest.image,
                    participantsCount: contest.participantsCount,
                    description: contest.description,
                    _id: contest._id,
                    winner: contest?.winner
                }));

                res.send(formattedResponse);
            } catch (error) {
                console.error('Error fetching popular contests:', error);
                res.status(500).json({ message: 'Error fetching popular contests' });
            }
        });





        app.delete('/contests/:id',  async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await contestsCollection.deleteOne(query)
            res.send(result)
        })



        app.post('/create-payment-intent',  async (req, res) => {
            const { price } = req.body
            const amount = parseInt(price * 100)
            if (!price || amount < 1) return
            const { client_secret } = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            })
            res.send({ clientSecret: client_secret })
        })

        app.post('/bookings',  async (req, res) => {
            const booking = req.body
            const result = await bookingsCollection.insertOne(booking)
            res.send(result)
        })

        app.get('/bookings/creator/:email', async (req, res) => {
            const email = req.params.email
            const result = await bookingsCollection
                .find({ 'creator': email })
                .toArray()
            res.send(result)
        })
        app.put('/contests/winner/:contestId',  async (req, res) => {
            const winner = req.body
            const id = req.params.contestId;
            console.log(id);
            const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
            if (contest.winner) {
                return res.status(400).send({ error: 'Winner already declared for this contest' });
            }
            const query = { _id: new ObjectId(id) }

            const updateDoc = {
                $set: {
                    winner: {
                        name: winner.name,
                        image: winner.image,
                        email: winner.email
                    }
                }
            }
            const result = await contestsCollection.updateOne(query, updateDoc)
            res.send(result)
        })

        app.put('/bookings/submissions/:id',  async (req, res) => {
            try {
                const id = req.params.id;
                const won = req.body;
                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        won: {
                            text: 'you won',
                            name: won.name,
                            image: won.image,
                            email: won.email
                        }
                    }
                };

                const result = await bookingsCollection.updateOne(query, updateDoc);
                res.send(result);
            } catch (error) {
                console.error('Error in updating winner:', error);
                res.status(500).send({ error: 'Failed to update winner' });
            }
        });


        app.get('/bookings/user/:email',  async (req, res) => {
            const email = req.params.email
            const result = await bookingsCollection
                .find({ 'user.email': email })
                .toArray()
            res.send(result)
        })
        app.get('/bookings/user/won/:email',  async (req, res) => {
            const email = req.params.email
            const result = await bookingsCollection
                .find({ 'won.email': email })
                .toArray()
            res.send(result)
        })
        app.get('/user-stat/:email', async (req, res) => {
            const userEmail = req.params.email;
            try {
                const userWinsCount = await bookingsCollection.countDocuments({
                    'won.email': userEmail,
                });
                res.json({ wins: userWinsCount });
            } catch (error) {
                console.error('Error fetching user wins:', error);
                res.status(500).json({ message: 'Error fetching user wins' });
            }
        });

        app.get('/top-creators-details', async (req, res) => {
            try {
                const topCreatorsDetails = await contestsCollection.aggregate([
                    {
                        $group: {
                            _id: '$creator.email',
                            creatorName: { $first: '$creator.name' },
                            creatorImage: { $first: '$creator.image' },
                            contestName: { $first: '$contestname' },
                            description: { $first: '$description' },
                            totalContests: { $sum: 1 },
                        },
                    },
                    {
                        $project: {
                            _id: 0,
                            creatorEmail: '$_id',
                            creatorName: 1,
                            creatorImage: 1,
                            contestName: 1,
                            description: 1,
                            totalContests: 1,
                        },
                    },
                    { $sort: { totalContests: -1 } },
                    { $limit: 3 },
                ]).toArray();

                res.json(topCreatorsDetails);
            } catch (error) {
                console.error('Error fetching top creators details:', error);
                res.status(500).json({ message: 'Error fetching top creators details' });
            }
        });






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello Contest Hub Server')
})

app.listen(port, () => {
    console.log(`Contest Hub is running on port ${port}`)
})
