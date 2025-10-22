const Joi = require('joi');

const ORDER_STATUS = {
  HOLD: 'hold',
  WORKING: 'working'
};

const createOrderSchema = Joi.object({
  order_created_fk_user_id: Joi.string().required(),
  order_name: Joi.string().required(),
  order_pickup_at: Joi.date().optional(),
  order_return_at: Joi.date().optional(),
  order_status: Joi.string()
    .valid(...Object.values(ORDER_STATUS))
    .default(ORDER_STATUS.WORKING),
  order_request_hold: Joi.boolean().default(false),
});



const orderItemAddSchema = Joi.object({
  oi_order_fk_order_id: Joi.string().required(),
  oi_inventory_fk_inventory_id: Joi.string().required(),
});


module.exports = {
  createOrderSchema,
  orderItemAddSchema
};
