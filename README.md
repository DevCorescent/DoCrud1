# Advanced Document Generator

A comprehensive, enterprise-grade document generation platform for private limited companies. Built with modern web technologies, featuring role-based access control, customizable templates, and a sleek admin interface.

## 🚀 Features

### Core Functionality
- **14+ Professional Document Types**: Appointment letters, NDAs, employment contracts, invoices, legal agreements, and more
- **Live Preview**: Real-time document preview with professional formatting
- **PDF Generation**: High-quality PDF export using Puppeteer
- **Email Integration**: Send documents directly via email with attachments
- **Document History**: Complete audit trail of all generated documents

### Advanced Features
- **Role-Based Access Control**: Admin, HR, Legal, and User roles with granular permissions
- **Custom Template Editor**: Create and edit templates with drag-and-drop field positioning
- **Dynamic Fields**: Add, remove, and reorder form fields with multiple input types
- **Secure PDF eSign Links**: Upload a PDF, place signature boxes per page, and collect a single recipient signature that gets stamped into all requested boxes
- **Admin Panel**: Complete user and template management interface
- **Modern UI/UX**: Responsive design with dark mode support and smooth animations

### Security & Compliance
- **Authentication**: Secure login system with NextAuth.js
- **Data Persistence**: JSON-based storage with versioning
- **Audit Logging**: Track all user actions and document generations

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **UI Components**: Radix UI, Tailwind CSS, Lucide Icons
- **Authentication**: NextAuth.js with credentials provider
- **PDF Generation**: Puppeteer
- **Email**: Nodemailer
- **Styling**: Tailwind CSS with custom design system

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Gmail account (for email functionality)

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd document-generator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local`:
   ```env
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=http://localhost:3000

   # Optional: Email configuration
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ```

   For Vercel production deployments, set `NEXTAUTH_SECRET` in Project Settings -> Environment Variables.
   `AUTH_SECRET` is also supported as an alias, but `NEXTAUTH_SECRET` is the preferred variable name for this app.

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Open [http://localhost:3000](http://localhost:3000)
   - Login with default credentials (see below)

## 👥 Default User Accounts

| Role  | Email              | Password  | Permissions |
|-------|-------------------|-----------|-------------|
| Admin | admin@company.com | admin123  | All documents + Admin panel |
| HR    | hr@company.com    | hr123     | HR documents |
| Legal | legal@company.com | legal123  | Legal documents |
| User  | user@company.com  | user123   | Limited documents |

## 📖 Usage Guide

### For Regular Users

1. **Login**: Use your assigned credentials
2. **Select Template**: Choose from available document types in the sidebar
3. **Fill Form**: Complete the required fields
4. **Preview**: See real-time preview of the document
5. **Generate**: Download PDF or send via email
6. **History**: View all your generated documents

### For Administrators

1. **Access Admin Panel**: Click "Admin Panel" in the sidebar
2. **User Management**:
   - Create new users with specific roles
   - Edit user permissions and details
   - Deactivate/reactivate accounts
3. **Template Management**:
   - Create custom document templates
   - Edit existing templates
   - Add/remove dynamic fields
   - Set field types and validation

### Creating Custom Templates

1. Go to Admin Panel → Template Management
2. Click "Create Template"
3. Fill in template details (name, description, category)
4. Add fields with different types (text, textarea, select, date, etc.)
5. Write HTML template with `{{fieldName}}` placeholders

### Secure PDF eSign links (signature boxes)

1. Workspace → Generate → eSign → Upload a PDF
2. In the Security step, enable Recipient signature and choose **Place boxes**
3. Drag on any rendered PDF page to add one or more signature boxes
4. Create the secure link and share it — the recipient signs once and their signature is stamped into every box

Note: This flow currently supports a single recipient signer per link. Multi-signer routing can be added on top of the `signerKey` field in `RecipientSignatureBoxPlacement`.
6. Use the preview feature to test your template
7. Save and assign to appropriate user roles

## 📄 Document Types

### HR Documents
- **Appointment Letter**: Formal job offer with terms and conditions
- **Offer Letter**: Initial employment offer
- **Employment Contract**: Comprehensive employment agreement
- **Termination Letter**: Employment termination notice
- **Resignation Letter**: Employee resignation acceptance
- **Performance Appraisal**: Employee performance review

### Legal Documents
- **Non-Disclosure Agreement (NDA)**: Confidentiality agreement with detailed clauses
- **Loan Agreement**: Loan terms and conditions
- **Service Agreement**: Service provision contract
- **Partnership Agreement**: Business partnership terms

### Business Documents
- **Invoice**: Billing document with itemized charges
- **Receipt**: Payment confirmation
- **Board Resolution**: Company board decisions
- **Meeting Minutes**: Meeting records and decisions

## 🔧 Configuration

### Email Setup (Gmail)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password: [Google App Passwords](https://support.google.com/accounts/answer/185833)
3. Add to `.env.local`:
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ```

### Custom Styling
Modify `app/globals.css` and `tailwind.config.js` for custom themes and styling.

## 🏗️ Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/     # Authentication
│   │   ├── generate-pdf/           # PDF generation
│   │   ├── send-email/             # Email sending
│   │   ├── history/                # Document history
│   │   ├── templates/              # Template management
│   │   └── users/                  # User management
│   ├── components/
│   │   ├── ui/                     # Reusable UI components
│   │   ├── DocumentGenerator.tsx   # Main application
│   │   ├── AdminPanel.tsx          # Admin interface
│   │   └── TemplateEditor.tsx      # Template editor
│   └── data/
│       ├── templates.ts            # Default templates
│       ├── users.json              # User data
│       └── custom/
│           └── templates.json      # Custom templates
├── lib/
│   └── utils.ts                    # Utility functions
└── types/
    ├── document.ts                 # Type definitions
    └── next-auth.d.ts              # Auth type extensions
```

## 🔒 Security Features

- **Secure Authentication**: JWT-based session management
- **Role-Based Access**: Granular permissions system
- **Input Validation**: Client and server-side validation
- **Data Sanitization**: XSS protection for HTML content
- **Audit Logging**: Complete activity tracking

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
   - `NEXTAUTH_SECRET`: required in production for login/session APIs
   - `NEXTAUTH_URL`: optional on Vercel, but recommended for custom domains
3. Deploy automatically on push

### Other Platforms
1. Build the application: `npm run build`
2. Start production server: `npm start`
3. Configure reverse proxy for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the code comments

## 🔄 Future Enhancements

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Advanced template versioning
- [ ] Bulk document generation
- [ ] Document signing integration
- [ ] Multi-language support
- [ ] API endpoints for integrations
- [ ] Advanced analytics and reporting
- Receipt
- Board Resolution
- Meeting Minutes

## Customization

- Add new document templates in `data/templates.ts`
- Modify existing templates for company-specific requirements
- Customize styling in the HTML templates

## Email Configuration

To enable email functionality:
1. Use Gmail or another SMTP service
2. Generate an app password for Gmail
3. Set EMAIL_USER and EMAIL_PASS in .env.local

## Technologies Used

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Puppeteer (PDF generation)
- Nodemailer (Email sending)
- File system (History storage)
