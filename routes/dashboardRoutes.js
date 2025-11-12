
const express = require('express');
const router = express.Router();
const Visit = require('../models/Visit');
const Product = require('../models/Product');
const Customer = require('../models/Customer'); // Import the Customer model
const auth = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// @route   GET api/dashboard/summary
// @desc    Get dashboard summary data for today
// @access  Private
router.get('/summary', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Base query for user role
    const userQuery = {};
    if (req.user.role !== 'admin') {
      userQuery.user = new mongoose.Types.ObjectId(req.user.id);
    }

    // 1. Get today's visits count
    const visitsTodayCount = await Visit.countDocuments({
      ...userQuery,
      createdAt: { $gte: today, $lt: tomorrow },
    });

    // 2. Calculate today's total sales
    const visitsToday = await Visit.find({
      ...userQuery,
      createdAt: { $gte: today, $lt: tomorrow },
    }).populate('inventory.product', 'price profit'); // Populate 'profit' instead of 'costPrice'

    let totalProfitToday = 0; // Initialize total profit for today
    let salesToday = 0;
    visitsToday.forEach(visit => {
      visit.inventory.forEach(item => {
        const sold = (item.initialStock + (item.addedStock || 0)) - item.finalStock - item.returns;
        // Check if product exists to prevent crash on deleted products
        if (sold > 0 && item.product) {
          salesToday += sold * item.product.price;
          // FIX: Use the pre-calculated 'profit' field from the product
          const profitPerItem = item.product.profit || 0;
          totalProfitToday += sold * profitPerItem;
        }
      });
    });

    // 3. Find today's top selling product
    const topProductData = await Visit.aggregate([
      { $match: { 
          ...userQuery,
          createdAt: { $gte: today, $lt: tomorrow } 
      } },
      { $unwind: '$inventory' },
      {
        $project: {
          productId: '$inventory.product',
          // CORRECTED: Added 'sold' field key for the calculation
          sold: {
            $subtract: [
              { $subtract: [{ $add: ['$inventory.initialStock', { $ifNull: ['$inventory.addedStock', 0] }] }, '$inventory.finalStock'] }, 
              '$inventory.returns'
            ]
          }
        },
      },
      { $match: { sold: { $gt: 0 } } },
      { $group: { _id: '$productId', totalSold: { $sum: '$sold' } } },
      { $sort: { totalSold: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: Product.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      { $unwind: '$productDetails' },
    ]);

    const topProduct = topProductData.length > 0 ? topProductData[0].productDetails.name : '-';

    res.json({
      visitsToday: visitsTodayCount,
      salesToday: salesToday,
      totalProfitToday: totalProfitToday, // Include total profit
      topProduct: topProduct,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/active-consignments
// @desc    Get customers with active consigned goods (finalStock > 0 on last visit)
// @access  Private
router.get('/active-consignments', auth, async (req, res) => {
  try {
    const activeConsignments = await Visit.aggregate([
      // Stage 1: Filter visits based on user role.
      ...(req.user.role !== 'admin' ? [{
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id)
        }
      }] : []),

      // Stage 2: Sort all relevant visits by customer and then by date, newest first.
      { $sort: { customer: 1, createdAt: -1 } },

      // Stage 3: Group by customer to get only the latest visit for each.
      {
        $group: {
          _id: '$customer',
          lastVisit: { $first: '$$ROOT' }
        }
      },

      // Stage 4: Calculate the total final stock for that last visit.
      {
        $addFields: {
          totalFinalStock: { $sum: '$lastVisit.inventory.finalStock' }
        }
      },

      // Stage 5: Filter out customers who have no stock left.
      { $match: { totalFinalStock: { $gt: 0 } } },

      // Stage 6: Look up the customer details for the remaining active customers.
      {
        $lookup: {
          from: Customer.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },

      // Stage 7: Project the final, clean shape of the data.
      { $project: { _id: '$customerInfo._id', name: '$customerInfo.name', address: '$customerInfo.address' } }
    ]);

    res.json(activeConsignments);
  } catch (err) {
    console.error('Error fetching active consignments:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/inactive-consignments
// @desc    Get customers with no active consignments (ready for a new initial visit)
// @access  Private
router.get('/inactive-consignments', auth, async (req, res) => {
  try {
    // First, find all customer IDs that HAVE active consignments
    const activeConsignments = await Visit.aggregate([
      // Add user filter at the beginning of the pipeline
      ...(req.user.role !== 'admin' ? [{
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id)
        }
      }] : []), // Filter by user if not admin
      { $sort: { customer: 1, createdAt: -1 } },
      { $group: { _id: '$customer', lastVisit: { $first: '$$ROOT' } } },
      {
        $match: {
          'lastVisit.inventory': { $elemMatch: { finalStock: { $gt: 0 } } }
        }
      },
      { $group: { _id: '$_id' } }
    ]);

    const activeCustomerIds = activeConsignments.map(c => c._id);

    // Now, find all customers whose ID is NOT IN the active list
    const inactiveCustomers = await Customer.find({
      // Add user filter here as well
      ...(req.user.role !== 'admin' ? {
        user: req.user.id
      } : {}),
      _id: { $nin: activeCustomerIds }
    }).select('name address'); // Select only the fields we need

    res.json(inactiveCustomers);
  } catch (err) {
    console.error('Error fetching inactive consignments:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/top-customers
// @desc    Get top 5 customers by sales in a date range
// @access  Private
router.get('/top-customers', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = {};

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const topCustomers = await Visit.aggregate([
      // Add user filter at the beginning of the pipeline
      { $match: { 
          ...(req.user.role !== 'admin' ? {
            user: new mongoose.Types.ObjectId(req.user.id)
          } : {}),
          ...matchStage 
      } },
      { $unwind: '$inventory' },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'inventory.product',
          foreignField: '_id',
          as: 'inventory.productDetails'
        }
      },
      { $unwind: '$inventory.productDetails' },
      {
        $project: {
          customerId: '$customer',
          // CORRECTED: Use the new formula that includes addedStock
          itemSale: { 
            $multiply: [
              { $subtract: [ { $add: ['$inventory.initialStock', { $ifNull: ['$inventory.addedStock', 0] }] }, { $add: ['$inventory.finalStock', '$inventory.returns'] } ] },
              '$inventory.productDetails.price'
            ] 
          }
        }
      },
      { $group: { _id: '$customerId', totalSales: { $sum: '$itemSale' } } },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: Customer.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' },
      { $project: { _id: 1, name: '$customerInfo.name', totalSales: 1 } }
    ]);

    res.json(topCustomers);
  } catch (err) {
    console.error('Error fetching top customers:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/top-products
// @desc    Get top 5 products by items sold in a date range
// @access  Private
router.get('/top-products', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = {};

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const topProducts = await Visit.aggregate([
      // Add user filter at the beginning of the pipeline
      { $match: { 
          ...(req.user.role !== 'admin' ? {
            user: new mongoose.Types.ObjectId(req.user.id)
          } : {}),
          ...matchStage 
      } },
      { $unwind: '$inventory' },
      // CORRECTED: Use the new formula that includes addedStock
      { 
        $project: { 
          productId: '$inventory.product', 
          sold: { 
            $subtract: [ { $add: ['$inventory.initialStock', { $ifNull: ['$inventory.addedStock', 0] }] }, { $add: ['$inventory.finalStock', '$inventory.returns'] } ] 
          } 
        } 
      },
      { $match: { sold: { $gt: 0 } } },
      { $group: { _id: '$productId', totalSold: { $sum: '$sold' } } },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      { $lookup: { from: Product.collection.name, localField: '_id', foreignField: '_id', as: 'productInfo' } },
      { $unwind: '$productInfo' },
      { $project: { _id: 1, name: '$productInfo.name', totalSold: 1 } }
    ]);

    res.json(topProducts);
  } catch (err) {
    console.error('Error fetching top products:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/dashboard/top-sales
// @desc    Get top 5 sales by total sales
// @access  Private
router.get('/top-sales', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = {};

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    const topSales = await Visit.aggregate([
      // Match visits based on date range and user role
      { $match: { 
          ...(req.user.role !== 'admin' ? {
            user: new mongoose.Types.ObjectId(req.user.id)
          } : {}),
          ...matchStage 
      } },
      { $unwind: '$inventory' },
      // CRITICAL FIX: Lookup product details to get the price BEFORE calculating sale value.
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'inventory.product',
          foreignField: 'inventory.product', // This should be '_id'
          foreignField: '_id',
          as: 'inventory.productDetails'
        }
      },
      { $unwind: '$inventory.productDetails' },
      {
        $project: {
          user: 1,
          // CORRECTED: Calculate saleValue using the looked-up price
          saleValue: { 
            $multiply: [
              { $subtract: [ { $add: ['$inventory.initialStock', { $ifNull: ['$inventory.addedStock', 0] }] }, { $add: ['$inventory.finalStock', '$inventory.returns'] } ] },
              '$inventory.productDetails.price'
            ] 
          }
        }
      },
      {
        $group: {
          _id: '$user',
          totalSales: { $sum: '$saleValue' }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users', // Assuming your user model is named 'User'
          localField: '_id',
          foreignField: '_id',
          as: 'salesInfo'
        }
      },
      { $unwind: '$salesInfo' },
      { $project: { _id: '$salesInfo._id', name: '$salesInfo.name', totalSales: 1 } }
    ]);

    res.json(topSales);
  } catch (err) {
    console.error('Error fetching top sales:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
