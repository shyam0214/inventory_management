const Order = require("@schemas/order.schema");
const OrderItem = require("@schemas/orderItem.schema");
const { getStatus, recalculateStatusesAfterRemoval } = require("@helper/orderItem");

const createOrderItem = async (req, res) => {
  try {
    const { oi_inventory_fk_inventory_id, oi_order_fk_order_id } = req.body;

    const existingOrderItem = await OrderItem.findOne({
      oi_inventory_fk_inventory_id,
      oi_order_fk_order_id,
    });

    if (existingOrderItem) {
      return res.status(400).json({
        sattus:false,
        message: "This inventory is already added to the order",
      });
    }

    const order = await Order.findOne({ order_id: oi_order_fk_order_id.toString() });

    if (!order) {
      return res.status(404).json({status:false , message: "Order not found" });
    }

    const { status, unavailableUntil } = await getStatus(order);

    const newOrderItem = new OrderItem({
      ...req.body,
      oi_pickup_at: order.order_pickup_at,
      oi_return_at: order.order_return_at,
      oi_status: status,
      oi_unavailable_until: unavailableUntil,
    });

    await newOrderItem.save();

    await Order.updateOne({ order_id: oi_order_fk_order_id }, { order_request_hold: false });

    return res.status(201).json({status:true,message:"Create Order Sccuessfully",data:newOrderItem});
  } catch (error) {
   return  res.status(500).json({status:false, error: error.message });
  }
};

const deleteOrderItem = async (req, res) => {
  try {
    const { order_item_id } = req.params;
    
    const orderItem = await OrderItem.findOne({ oi_id: order_item_id });
    
    if (!orderItem) {
      return res.status(404).json({ error: "Order item not found" });
    }
    
    const statusUpdates = await recalculateStatusesAfterRemoval(orderItem);
    
    for (const update of statusUpdates) {
      await OrderItem.updateOne(
        { _id: update.id },
        { $set: { oi_status: update.newStatus } }
      );
    }
    
    await OrderItem.updateOne(
      { oi_id: order_item_id },
      { $set: { oi_status: "cancelled" } }
    );
    
    res.status(200).json({ 
      message: "Order item removed successfully",
      statusUpdates 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createOrderItem,
  deleteOrderItem,
};
