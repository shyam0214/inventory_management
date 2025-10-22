const express = require('express');
const mongoose = require('mongoose');
require('module-alias/register');
const userRoutes = require('./src/routes/user.routes');
const orderRoutes = require('./src/routes/order.routes');
const orderItemRoutes = require('./src/routes/orderItem.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

mongoose.connect('mongodb+srv://shyamgupta00555_db_user:wN8LkaDIErAfUgE3@devlopment.lhhtbgq.mongodb.net/inventery', { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});


app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/order-items', orderItemRoutes);
app.use('/inventory', inventoryRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


