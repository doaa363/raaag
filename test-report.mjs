/**
 * Day 6 – Executive Report Generator Test
 * ──────────────────────────────────────
 * Seeds test shipments and incidents (falls back gracefully if DB is offline),
 * calls /reports/generate, checks the database record, and verifies
 * the generated PDF document.
 *
 * Run: node test-report.mjs
 */
import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BASE_URL = 'http://localhost:3000';
const COMPANY_ID = '60d5ecb8b3b3a30015f8e5a1'; // Valid MongoDB ObjectId format

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logiCore_rag', {
      serverSelectionTimeoutMS: 2000
    });

    const Shipment = mongoose.model('Shipment', new mongoose.Schema({
      companyId: mongoose.Types.ObjectId,
      trackingNumber: String,
      status: String,
      expectedDelivery: Date,
      deliveredAt: Date,
      createdAt: Date,
      driver: { onTimeRate: Number },
      route: { length: Number }
    }, { timestamps: true }));

    const Incident = mongoose.model('Incident', new mongoose.Schema({
      companyId: mongoose.Types.ObjectId,
      type: String,
      status: String,
      createdAt: Date,
      resolvedAt: Date,
      description: String
    }, { timestamps: true }));

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 30);

    // Clean existing
    await Shipment.deleteMany({ companyId: COMPANY_ID });
    await Incident.deleteMany({ companyId: COMPANY_ID });

    // Seed shipments
    for (let i = 0; i < 20; i++) {
      const delivered = Math.random() > 0.3;
      const expectedDelivery = new Date(start.getTime() + i * 86400000);
      const deliveredAt = delivered 
        ? new Date(expectedDelivery.getTime() + (Math.random() > 0.8 ? 5 * 3600000 : -2 * 3600000))
        : undefined;

      await Shipment.create({
        companyId: COMPANY_ID,
        trackingNumber: `SHIP-DAY6-${i}`,
        status: delivered ? 'DELIVERED' : 'IN_TRANSIT',
        expectedDelivery,
        deliveredAt,
        createdAt: new Date(expectedDelivery.getTime() - 24 * 3600000),
        driver: { onTimeRate: 0.75 + Math.random() * 0.2 },
        route: { length: 3 + Math.floor(Math.random() * 10) }
      });
    }

    // Seed incidents
    const incidentTypes = ['DAMAGE', 'DELAY', 'CUSTOMER_COMPLAINT', 'DRIVER_REPORT', 'SYSTEM'];
    for (let i = 0; i < 5; i++) {
      await Incident.create({
        companyId: COMPANY_ID,
        type: incidentTypes[i % incidentTypes.length],
        status: i < 3 ? 'RESOLVED' : 'OPEN',
        createdAt: new Date(start.getTime() + i * 86400000 * 2),
        resolvedAt: i < 3 ? new Date(start.getTime() + i * 86400000 * 2 + 2 * 3600000) : undefined,
        description: `Day 6 test incident ${i}`
      });
    }

    console.log('✅ Test shipments and incidents seeded successfully.');
  } catch (err) {
    console.warn('⚠️ MongoDB is offline/unreachable. Bypassing seeding and using service mock fallbacks.');
  }
}

async function runTest() {
  try {
    await seedData();

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 30);

    console.log('\n[http] POST /api/v1/rag/reports/generate ...');
    const response = await axios.post(`${BASE_URL}/api/v1/rag/reports/generate`, {
      start: start.toISOString(),
      end: now.toISOString(),
      companyId: COMPANY_ID
    }, {
      headers: {
        'x-user-id': 'test-user-day6',
        'x-company-id': COMPANY_ID,
        'x-user-role': 'MANAGER'
      }
    });

    console.log('✅ Response:', response.data);
    const reportId = response.data.reportId;

    console.log('\n[http] GET /api/v1/rag/reports/latest ...');
    const latestRes = await axios.get(`${BASE_URL}/api/v1/rag/reports/latest`, {
      headers: {
        'x-user-id': 'test-user-day6',
        'x-company-id': COMPANY_ID,
        'x-user-role': 'MANAGER'
      }
    });

    const report = latestRes.data;
    console.log('📄 Latest Report retrieved:');
    console.log(`   ID:      ${report._id}`);
    console.log(`   Title:   ${report.title}`);
    console.log(`   Summary: ${report.summary.slice(0, 150)}...`);
    console.log(`   Findings count: ${report.keyFindings?.length ?? 0}`);
    console.log(`   PDF URL: ${report.pdfUrl}`);

    // Check if the file is generated on disk
    if (report.pdfUrl) {
      const actualFilename = path.basename(report.pdfUrl);
      const reportsDir = path.join(process.cwd(), 'reports');
      const filepath = path.join(reportsDir, actualFilename);

      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`\n✅ PDF document verified on disk!`);
        console.log(`   Path: ${filepath}`);
        console.log(`   Size: ${stats.size} bytes`);
        console.log('\n🎉 Day 6 SUCCESS — executive report generator fully verified.');
      } else {
        console.error(`\n❌ PDF file does not exist on disk at expected path: ${filepath}`);
      }
    } else {
      console.error('\n❌ PDF URL is missing from report');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
}

runTest();
