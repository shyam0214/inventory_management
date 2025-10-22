const express = require('express');
const router = express.Router();
const {createOrder ,requestHold ,confirmOrder ,updateOrder,holdOrderList} = require('../controllers/order.controller');
const {validateRequest} = require("@validators/validateRequest.js")
const {createOrderSchema} = require("@validators/orderValidator.js")

router.post('/',validateRequest(createOrderSchema), createOrder);
router.put('/request-hold/:order_id', requestHold);
router.put('/confirm-order/:order_id', confirmOrder);
router.put('/update-order/:order_id', updateOrder);
router.get('/holdOrderList', holdOrderList);

module.exports = router;
``