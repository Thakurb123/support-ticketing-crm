# support-ticketing-crm
Project Overview

This project is a web-based Customer Support Ticketing CRM built using Google Apps Script, Google Sheets, HTML, CSS, and JavaScript.

The system helps support teams manage customer tickets, track escalations, maintain customer and order records, and monitor ticket resolution workflows through a responsive dashboard interface.

Features
Create and manage support tickets
Automatic unique ticket ID generation
Search tickets by:
Ticket ID
Customer Name
Order ID
Phone Number
Email
Filter tickets by:
Status
Communication Channel
Escalation Level
Date Range
Ticket status tracking
Escalation management
Team bucket view
Linked order information
Conversation transcripts
CSV export functionality
Responsive three-panel CRM dashboard
Technology Stack
Frontend
HTML5
CSS3
Vanilla JavaScript
Backend
Google Apps Script
Database
Google Sheets
Project Structure
Code.gs              -> Backend Apps Script logic
Index.html           -> Main UI structure
Styles.html          -> Styling and responsive layout
JavaScript.html      -> Frontend functionality
appsscript.json      -> Apps Script configuration
Google Sheets Database Structure

The project uses multiple Google Sheets as database tables:

Tickets
Customers
Orders
Team
EscalationHistory
Transcripts
Attachments
Setup Instructions
1. Create Google Sheet

Create a new Google Sheet and copy the Spreadsheet ID.

2. Create Apps Script Project

Open Google Apps Script and create a new project.

3. Add Files

Create the following files:

Code.gs
Index.html
Styles.html
JavaScript.html
appsscript.json

Paste the project code into respective files.

4. Update Spreadsheet ID

Replace the Spreadsheet ID inside Code.gs.

const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID'
}
5. Initialize Database

Run:

setupDatabase()

This creates all required sheets and sample data.

6. Deploy Web App

Click:
Deploy → New Deployment → Web App

Settings:

Execute As: Me
Access: Anyone

Deploy and copy the web app URL.

Key Functionalities
Ticket Management
Create tickets
Update ticket details
Resolve tickets
Escalate tickets
Search & Filters

Users can quickly search and filter tickets using multiple criteria.

Escalation Tracking

Escalation history is stored separately for tracking ticket movement between departments.

Reporting

Export ticket data into CSV format.

Challenges Faced
Managing relational-style data using Google Sheets
Handling real-time synchronization with Apps Script
Generating unique ticket IDs safely using LockService
Organizing scalable sheet structures
Future Improvements
Email notifications
Google Drive file upload support
Role-based authentication
SLA tracking
Analytics dashboard
Pagination for large datasets
