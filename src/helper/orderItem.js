const OrderItem = require("@schemas/orderItem.schema");


const findConflictingItems = async (inventoryId, orderId, pickupDate, returnDate) => {
  return await OrderItem.find({
    oi_inventory_fk_inventory_id: inventoryId,
    oi_order_fk_order_id: { $ne: orderId },
    $or: [
      {
        oi_pickup_at: {
          $lte: returnDate,
          $gte: pickupDate,
        },
      },
      {
        oi_return_at: {
          $lte: returnDate,
          $gte: pickupDate,
        },
      },
      {
        $and: [
          { oi_pickup_at: { $lte: pickupDate } },
          { oi_return_at: { $gte: returnDate } },
        ],
      },
    ],
    oi_status: { 
    $nin: ["CANCELLED", "AVAILABLE", "IN", "UNAVAILABLE", "UNAVAILABLE_UNTIL"] 
    }
  });
};

const getStatus = async (order, inventoryId) => {
  const conflictingItems = await findConflictingItems(
    inventoryId,
    order.order_id,
    order.order_pickup_at,
    order.order_return_at
  );

  if (conflictingItems.length === 0) {
    return { status: "available" };
  }

  const confirmedItem = conflictingItems.find(
    (item) => item.oi_status === "confirmed"
  );
  if (confirmedItem) {
    return {
      status: "unavailable-until",
      unavailableUntil: confirmedItem.oi_return_at,
    };
  }

  const statuses = conflictingItems.map((item) => item.oi_status);
  if (
    statuses.includes("on-hold") ||
    statuses.includes("on-hold-request")
  ) {
    if (
      statuses.includes("2nd-hold") ||
      statuses.includes("2nd-hold-request")
    ) {
      if (
        statuses.includes("3rd-hold") ||
        statuses.includes("3rd-hold-request")
      ) {
        return { status: "unavailable" };
      }
      return { status: "3rd-hold-request" };
    }
    return { status: "2nd-hold-request" };
  }

  return { status: "on-hold-request" };
};

// Function to calculate status for request hold
const calculateRequestHoldStatus = async (orderItem) => {
  const conflictingItems = await findConflictingItems(
    orderItem.oi_inventory_fk_inventory_id,
    orderItem.oi_order_fk_order_id,
    orderItem.oi_pickup_at,
    orderItem.oi_return_at
  );

  if (conflictingItems.length === 0) {
    return "on-hold-request";
  }

  const confirmedItem = conflictingItems.find(
    (item) => item.oi_status === "confirmed"
  );
  if (confirmedItem) {
    return "unavailable-until";
  }

  const onHoldCount = conflictingItems.filter(
    (item) => item.oi_status === "on-hold" || item.oi_status === "on-hold-request"
  ).length;

  const secondHoldCount = conflictingItems.filter(
    (item) => item.oi_status === "2nd-hold" || item.oi_status === "2nd-hold-request"
  ).length;

  const thirdHoldCount = conflictingItems.filter(
    (item) => item.oi_status === "3rd-hold" || item.oi_status === "3rd-hold-request"
  ).length;

  if (onHoldCount > 0) {
    if (secondHoldCount > 0) {
      if (thirdHoldCount > 0) {
        return "unavailable";
      }
      return "3rd-hold-request";
    }
    return "2nd-hold-request";
  }

  return "on-hold-request";
};

// Function to recalculate statuses when an item is removed
const recalculateStatusesAfterRemoval = async (removedItem) => {
  const conflictingItems = await findConflictingItems(
    removedItem.oi_inventory_fk_inventory_id,
    removedItem.oi_order_fk_order_id,
    removedItem.oi_pickup_at,
    removedItem.oi_return_at
  );

  // Sort by creation date to maintain order priority
  conflictingItems.sort((a, b) => a.createdAt - b.createdAt);

  const statusUpdates = [];

  if (removedItem.oi_status === "confirmed") {
    for (const item of conflictingItems) {
      if (item.oi_status === "unavailable-until") {
        const otherConfirmedItems = await OrderItem.find({
          oi_inventory_fk_inventory_id: removedItem.oi_inventory_fk_inventory_id,
          oi_order_fk_order_id: { $ne: item.oi_order_fk_order_id, $ne: removedItem.oi_order_fk_order_id },
          oi_status: "confirmed",
          $or: [
            {
              oi_pickup_at: {
                $lte: item.oi_return_at,
                $gte: item.oi_pickup_at,
              },
            },
            {
              oi_return_at: {
                $lte: item.oi_return_at,
                $gte: item.oi_pickup_at,
              },
            },
            {
              $and: [
                { oi_pickup_at: { $lte: item.oi_pickup_at } },
                { oi_return_at: { $gte: item.oi_return_at } },
              ],
            },
          ],
        });

        if (otherConfirmedItems.length === 0) {
          statusUpdates.push({
            id: item._id,
            newStatus: "available"
          });
        }
      }
    }
  } 
  else if (removedItem.oi_status === "on-hold" || removedItem.oi_status === "on-hold-request") {
    const secondHoldItems = conflictingItems.filter(
      item => item.oi_status === "2nd-hold" || item.oi_status === "2nd-hold-request"
    );
    
    if (secondHoldItems.length > 0) {
      const itemToPromote = secondHoldItems[0];
      statusUpdates.push({
        id: itemToPromote._id,
        newStatus: itemToPromote.oi_status === "2nd-hold" ? "on-hold" : "on-hold-request"
      });
      
      const thirdHoldItems = conflictingItems.filter(
        item => item.oi_status === "3rd-hold" || item.oi_status === "3rd-hold-request"
      );
      
      if (thirdHoldItems.length > 0) {
        const thirdItemToPromote = thirdHoldItems[0];
        statusUpdates.push({
          id: thirdItemToPromote._id,
          newStatus: thirdItemToPromote.oi_status === "3rd-hold" ? "2nd-hold" : "2nd-hold-request"
        });
      }
    }
  }
  else if (removedItem.oi_status === "2nd-hold" || removedItem.oi_status === "2nd-hold-request") {
    const thirdHoldItems = conflictingItems.filter(
      item => item.oi_status === "3rd-hold" || item.oi_status === "3rd-hold-request"
    );
    
    if (thirdHoldItems.length > 0) {
      const itemToPromote = thirdHoldItems[0];
      statusUpdates.push({
        id: itemToPromote._id,
        newStatus: itemToPromote.oi_status === "3rd-hold" ? "2nd-hold" : "2nd-hold-request"
      });
    }
  }

  return statusUpdates;
};

const validateOrderUpdate = async (orderId, newPickupDate, newReturnDate) => {
  const orderItems = await OrderItem.find({ oi_order_fk_order_id: orderId });
  
  const statusChanges = [];
  let hasConfirmedConflict = false;
  
  for (const item of orderItems) {
    const confirmedConflicts = await OrderItem.find({
      oi_inventory_fk_inventory_id: item.oi_inventory_fk_inventory_id,
      oi_order_fk_order_id: { $ne: orderId },
      oi_status: "confirmed",
      $or: [
        {
          oi_pickup_at: {
            $lte: newReturnDate,
            $gte: newPickupDate,
          },
        },
        {
          oi_return_at: {
            $lte: newReturnDate,
            $gte: newPickupDate,
          },
        },
        {
          $and: [
            { oi_pickup_at: { $lte: newPickupDate } },
            { oi_return_at: { $gte: newReturnDate } },
          ],
        },
      ],
    });
    
    if (confirmedConflicts.length > 0) {
      hasConfirmedConflict = true;
      break;
    }
    
    const conflictingItems = await findConflictingItems(
      item.oi_inventory_fk_inventory_id,
      orderId,
      newPickupDate,
      newReturnDate
    );
    
    let newStatus = item.oi_status;
    
    if (conflictingItems.length === 0) {
      if (item.oi_status !== "confirmed") {
        newStatus = "available";
      }
    } else {
      const onHoldCount = conflictingItems.filter(
        i => i.oi_status === "on-hold" || i.oi_status === "on-hold-request"
      ).length;
      
      const secondHoldCount = conflictingItems.filter(
        i => i.oi_status === "2nd-hold" || i.oi_status === "2nd-hold-request"
      ).length;
      
      if (item.oi_status === "on-hold" || item.oi_status === "on-hold-request") {
      } else if (onHoldCount > 0 && secondHoldCount === 0) {
        newStatus = item.oi_status.includes("hold") ? "2nd-hold" : "2nd-hold-request";
      } else if (onHoldCount > 0 && secondHoldCount > 0) {
        newStatus = item.oi_status.includes("hold") ? "3rd-hold" : "3rd-hold-request";
      }
    }
    
    if (newStatus !== item.oi_status) {
      statusChanges.push({
        id: item._id,
        oldStatus: item.oi_status,
        newStatus: newStatus
      });
    }
  }
  
  return { hasConfirmedConflict, statusChanges };
};

module.exports = {
  getStatus,
  calculateRequestHoldStatus,
  recalculateStatusesAfterRemoval,
  validateOrderUpdate,
  findConflictingItems
};
