const Order = require("@schemas/order.schema");
const OrderItem = require("@schemas/orderItem.schema");
const { calculateRequestHoldStatus, validateOrderUpdate, findConflictingItems } = require("@helper/orderItem");

const createOrder = async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    return res.status(201).send({status:true , message:"Create Order Sccussfully"});
  } catch (error) {
    return res.status(400).send({status:falsee , message :error.message});
  }
};



const requestHold = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { order_request_hold } = req.body;

    if (!order_request_hold) {
      return res.status(400).json({ error: "order_request_hold must be true" });
    }

    const order = await Order.findOne({order_id: order_id });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }


    const orderItems = await OrderItem.find({ oi_order_fk_order_id: order_id });
    if (orderItems.length === 0) {
      return res.status(400).json({ error: "No items in this order" });
    }

    const statusUpdates = [];
    for (const item of orderItems) {
      const newStatus = await calculateRequestHoldStatus(item);
      
      await OrderItem.updateOne(
        { _id: item._id },
        { 
          $set: { 
            oi_status: newStatus,
            oi_unavailable_until: newStatus === "unavailable-until" ? 
              (await findConflictingItems(
                item.oi_inventory_fk_inventory_id,
                item.oi_order_fk_order_id,
                item.oi_pickup_at,
                item.oi_return_at
              )).find(i => i.oi_status === "confirmed")?.oi_return_at : null
          }
        }
      );
      
      statusUpdates.push({
        item_id: item.oi_id,
        oldStatus: item.oi_status,
        newStatus
      });
    }

    await Order.updateOne(
      { order_id },
      { $set: { order_status: "hold", order_request_hold: true } }
    );

    return res.status(200).json({
      status:true ,
      message: "Order hold requested successfully",
      statusUpdates
    });
  } catch (error) {
    return res.status(500).json({ status:flase , error: error.message });
  }
};

const updateOrder = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { order_pickup_at, order_return_at } = req.body;

    if (!order_pickup_at || !order_return_at) {
      return res.status(400).json({ error: "Pickup and return dates are required" });
    }

    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { hasConfirmedConflict, statusChanges } = await validateOrderUpdate(
      order_id,
      new Date(order_pickup_at),
      new Date(order_return_at)
    );

    if (hasConfirmedConflict) {
      return res.status(400).json({
        error: "Cannot update order dates due to conflicts with confirmed orders"
      });
    }

    await Order.updateOne(
      { order_id },
      { $set: { order_pickup_at, order_return_at } }
    );

    for (const change of statusChanges) {
      await OrderItem.updateOne(
        { _id: change.id },
        { 
          $set: { 
            oi_status: change.newStatus,
            oi_pickup_at: order_pickup_at,
            oi_return_at: order_return_at
          }
        }
      );
    }

    await OrderItem.updateMany(
      { 
        oi_order_fk_order_id: order_id,
        _id: { $nin: statusChanges.map(change => change.id) }
      },
      { 
        $set: { 
          oi_pickup_at: order_pickup_at,
          oi_return_at: order_return_at
        }
      }
    );

    res.status(200).json({
      message: "Order updated successfully",
      statusChanges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const confirmOrder = async (req, res) => {
  try {
    const { order_id } = req.params;
    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({status:false , message: "Order not found" });
    }

    const orderItems = await OrderItem.find({ oi_order_fk_order_id: order_id });
    if (orderItems.length === 0) {
      return res.status(400).json({ status:false ,message: "No items in this order" });
    }

    const invalidItems = orderItems.filter(
      item => item.oi_status !== "available" && item.oi_status !== "on-hold"
    );

    if (invalidItems.length > 0) {
      return res.status(400).json({
        error: "Cannot confirm order. Some items have invalid status",
        invalidItems: invalidItems.map(item => ({
          item_id: item.oi_id,
          status: item.oi_status
        }))
      });
    }

    await OrderItem.updateMany(
      { oi_order_fk_order_id: order_id },
      { $set: { oi_status: "confirmed" } }
    );





    const statusUpdates = [];
    for (const item of orderItems) {
      const conflictingItems = await findConflictingItems(
        item.oi_inventory_fk_inventory_id,
     order_id,
        item.oi_pickup_at,
        item.oi_return_at
      );

      for (const conflictItem of conflictingItems) {
        await OrderItem.updateOne(
          { _id: conflictItem._id },
          { 
            $set: { 
              oi_status: "unavailable-until",
              oi_unavailable_until: item.oi_return_at
            }
          }
        );

        statusUpdates.push({
          item_id: conflictItem.oi_id,
          oldStatus: conflictItem.oi_status,
          newStatus: "unavailable-until"
        });
      }
    }


    await Order.updateOne(
      { order_id },
      { $set: { order_status: "confirm" } }
    );

   return res.status(200).json({
      status:true,
      message: "Order confirmed successfully",
      statusUpdates
    });
  } catch (error) {
    return res.status(500).json({ status:false,error: error.message });
  }
};


const holdOrderList = async (req, res) => {
  try {
    
    const order = await OrderItem.find({order_status:{ $ne: "confirm" } });
   
    return res.status(200).json({
      status:true,
      message: "Order confirmed successfully",
      order
    });
  } catch (error) {
    return res.status(500).json({status:false , message: error.message });
  }
};

module.exports = {
  createOrder,
  updateOrder,
  requestHold,
  confirmOrder,
  holdOrderList
};
