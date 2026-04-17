#!/usr/bin/env ts-node
/**
 * V1 Listing Types and Data Structure Audit Script
 * Task 2.1: Research V1 listing types and data structure
 * 
 * This script connects to the V1 database and executes comprehensive
 * audit queries to document listing types, pricing models, quantity
 * tracking, status values, and edge cases.
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const pool = new Pool({
  host: '192.168.88.6',
  port: 5432,
  database: 'scmarket',
  user: 'scmarket',
  password: 'scmarket',
});

interface AuditResult {
  section: string;
  query: string;
  results: any[];
  rowCount: number;
  executionTime: number;
}

const auditResults: AuditResult[] = [];

/**
 * Execute a query and capture results
 */
async function executeQuery(section: string, query: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    const result = await pool.query(query);
    const executionTime = Date.now() - startTime;
    
    auditResults.push({
      section,
      query: query.trim(),
      results: result.rows,
      rowCount: result.rowCount || 0,
      executionTime,
    });
    
    console.log(`✓ ${section} (${result.rowCount} rows, ${executionTime}ms)`);
  } catch (error) {
    console.error(`✗ ${section} - Error:`, error);
    auditResults.push({
      section,
      query: query.trim(),
      results: [{ error: error instanceof Error ? error.message : String(error) }],
      rowCount: 0,
      executionTime: Date.now() - startTime,
    });
  }
}

/**
 * Main audit execution
 */
async function runAudit(): Promise<void> {
  console.log('Starting V1 Listing Types and Data Structure Audit...\n');
  console.log('Database: scmarket @ 192.168.88.6\n');
  
  // Read SQL file
  const sqlFilePath = path.join(__dirname, 'audit-v1-listing-types.sql');
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
  
  // Remove comments and split by semicolon
  const queries = sqlContent
    .split('\n')
    .filter(line => !line.trim().startsWith('--') || line.includes('PART'))
    .join('\n')
    .split(';')
    .map(q => q.trim())
    .filter(q => {
      const lower = q.toLowerCase();
      return q.length > 0 && (
        lower.includes('select') || 
        lower.includes('insert') || 
        lower.includes('update') || 
        lower.includes('delete')
      );
    });
  
  console.log(`Found ${queries.length} queries to execute\n`);
  
  let queryNumber = 1;
  for (const query of queries) {
    // Extract a meaningful title from the query
    const firstLine = query.split('\n')[0].substring(0, 100);
    const title = `Query ${queryNumber}: ${firstLine}`;
    
    await executeQuery(title, query);
    queryNumber++;
  }
  
  console.log('\n✓ Audit complete!\n');
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(): string {
  const report: string[] = [];
  
  report.push('# V1 Listing Types and Data Structure Audit Report\n');
  report.push('**Task:** 2.1 Research V1 listing types and data structure');
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push('**Database:** scmarket @ 192.168.88.6\n');
  report.push('---\n');
  
  let currentSection = '';
  
  for (const result of auditResults) {
    // Extract section name
    const sectionMatch = result.section.match(/PART \d+: (.+)/);
    const section = sectionMatch ? sectionMatch[1] : result.section;
    
    if (section !== currentSection) {
      currentSection = section;
      report.push(`\n## ${section}\n`);
    }
    
    report.push(`### ${result.section}\n`);
    report.push(`**Execution Time:** ${result.executionTime}ms`);
    report.push(`**Row Count:** ${result.rowCount}\n`);
    
    if (result.results.length > 0 && !result.results[0].error) {
      // Format as markdown table
      const keys = Object.keys(result.results[0]);
      
      // Table header
      report.push('| ' + keys.join(' | ') + ' |');
      report.push('| ' + keys.map(() => '---').join(' | ') + ' |');
      
      // Table rows (limit to 50 rows for readability)
      const displayRows = result.results.slice(0, 50);
      for (const row of displayRows) {
        const values = keys.map(key => {
          const value = row[key];
          if (value === null) return 'NULL';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        });
        report.push('| ' + values.join(' | ') + ' |');
      }
      
      if (result.results.length > 50) {
        report.push(`\n*... ${result.results.length - 50} more rows omitted*\n`);
      }
    } else if (result.results[0]?.error) {
      report.push(`\n**Error:** ${result.results[0].error}\n`);
    } else {
      report.push('\n*No results*\n');
    }
    
    report.push('');
  }
  
  // Summary statistics
  report.push('\n---\n');
  report.push('## Summary\n');
  report.push(`- **Total Queries Executed:** ${auditResults.length}`);
  report.push(`- **Total Execution Time:** ${auditResults.reduce((sum, r) => sum + r.executionTime, 0)}ms`);
  report.push(`- **Total Rows Retrieved:** ${auditResults.reduce((sum, r) => sum + r.rowCount, 0)}`);
  report.push(`- **Errors:** ${auditResults.filter(r => r.results[0]?.error).length}`);
  
  return report.join('\n');
}

/**
 * Generate JSON report
 */
function generateJsonReport(): string {
  return JSON.stringify(auditResults, null, 2);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    await runAudit();
    
    // Generate reports
    const markdownReport = generateMarkdownReport();
    const jsonReport = generateJsonReport();
    
    // Write reports to files
    const docsDir = path.join(__dirname, '..', 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    const markdownPath = path.join(docsDir, 'v1-listing-types-audit.md');
    const jsonPath = path.join(docsDir, 'v1-listing-types-audit.json');
    
    fs.writeFileSync(markdownPath, markdownReport);
    fs.writeFileSync(jsonPath, jsonReport);
    
    console.log(`\n✓ Reports generated:`);
    console.log(`  - ${markdownPath}`);
    console.log(`  - ${jsonPath}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the audit
main();
