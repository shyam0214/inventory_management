const express = require('express');
const router = express.Router();
const orderItemController = require('@controllers/orderItem.controller');
const {validateRequest} = require("@validators/validateRequest.js")
const {orderItemAddSchema} = require("@validators/orderValidator.js")

router.post('/', validateRequest(orderItemAddSchema),orderItemController.createOrderItem);
router.delete('/remove-order-item/:oi_id', orderItemController.deleteOrderItem);

module.exports = router;
