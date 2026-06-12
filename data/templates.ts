import { DocumentTemplate } from '../types/document';

export const documentTemplates: DocumentTemplate[] = [
  {
    id: 'general-letterhead',
    name: 'General Letterhead',
    category: 'General',
    description: 'Reusable Corescent letterhead document with the same approved contractual-agreement visual shell.',
    isCustom: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
    fields: [
      { id: 'letterDate', name: 'letterDate', label: 'Letter Date', type: 'text', required: true, order: 1 },
      { id: 'recipientName', name: 'recipientName', label: 'Recipient Name', type: 'text', required: false, order: 2 },
      { id: 'recipientAddress', name: 'recipientAddress', label: 'Recipient Address', type: 'textarea', required: false, order: 3 },
      { id: 'subjectLine', name: 'subjectLine', label: 'Subject Line', type: 'text', required: false, order: 4 },
      { id: 'bodyContent', name: 'bodyContent', label: 'Letter Body', type: 'textarea', required: true, order: 5 },
      { id: 'closingLine', name: 'closingLine', label: 'Closing Line', type: 'textarea', required: false, order: 6 },
    ],
    template: `
      <p>${'{{letterDate}}'}</p>
      <p><strong>${'{{recipientName}}'}</strong></p>
      <p>${'{{recipientAddress}}'}</p>
      <p><strong>Subject:</strong> ${'{{subjectLine}}'}</p>
      <div>${'{{bodyContent}}'}</div>
      <div>${'{{closingLine}}'}</div>
      <p><strong>For Corescent Technologies Pvt. Ltd.</strong></p>
      <p>Kushagra Sharma<br/>CEO &amp; MD</p>
    `,
  },
  {
    id: 'contractual-agreement',
    name: 'Contractual Agreement',
    category: 'Legal',
    description: 'Corescent Technologies contractual agreement template based on the approved company PDF.',
    isCustom: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
    fields: [
      { id: 'agreementDay', name: 'agreementDay', label: 'Agreement Day', type: 'text', required: true, order: 1 },
      { id: 'agreementMonth', name: 'agreementMonth', label: 'Agreement Month', type: 'text', required: true, order: 2 },
      { id: 'agreementYear', name: 'agreementYear', label: 'Agreement Year', type: 'text', required: true, order: 3 },
      { id: 'engagedIndividualName', name: 'engagedIndividualName', label: 'Engaged Individual Name', type: 'text', required: true, order: 4 },
      { id: 'address', name: 'address', label: 'Address', type: 'textarea', required: true, order: 5 },
      { id: 'state', name: 'state', label: 'State', type: 'text', required: true, order: 6 },
      { id: 'country', name: 'country', label: 'Country', type: 'text', required: true, order: 7 },
      { id: 'servicesDescription', name: 'servicesDescription', label: 'Scope of Services', type: 'textarea', required: true, order: 8 },
      { id: 'startDate', name: 'startDate', label: 'Start Date', type: 'date', required: true, order: 9 },
      { id: 'termEndCondition', name: 'termEndCondition', label: 'Term End Condition', type: 'textarea', required: true, order: 10 },
      { id: 'compensationModel', name: 'compensationModel', label: 'Compensation Model', type: 'textarea', required: true, order: 11 },
      { id: 'paymentSchedule', name: 'paymentSchedule', label: 'Payment Schedule', type: 'textarea', required: true, order: 12 },
      { id: 'paymentWindowDays', name: 'paymentWindowDays', label: 'Payment Window (Days)', type: 'number', required: true, order: 13 },
      { id: 'nonSolicitMonths', name: 'nonSolicitMonths', label: 'Non-Solicitation Period (Months)', type: 'number', required: true, order: 14 },
      { id: 'noticePeriodDays', name: 'noticePeriodDays', label: 'Notice Period (Days)', type: 'number', required: true, order: 15 },
      { id: 'governingLaw', name: 'governingLaw', label: 'Governing Law', type: 'text', required: true, order: 16 },
      { id: 'jurisdictionCity', name: 'jurisdictionCity', label: 'Jurisdiction City', type: 'text', required: true, order: 17 },
    ],
    template: `
      <p>This Agreement is made on this {{agreementDay}} day of {{agreementMonth}}, {{agreementYear}}</p>
      <h2>By and Between</h2>
      <p>Corescent Technologies, a company incorporated under the Companies Act, 2013, having its registered office at WeWork Latitude, 10th floor, RMZ Latitude, Hebbal, Bengaluru, Karnataka PIN-560024 (hereinafter referred to as the “Company”).</p>
      <p>And</p>
      <p>Mr./Ms. {{engagedIndividualName}}, residing at {{address}}, {{state}}, {{country}} (hereinafter referred to as the “Engaged Individual”). The Company and the Engaged Individual shall collectively be referred to as the “Parties” and individually as a “Party”.</p>
      <h3>1. Purpose</h3>
      <p>The Company engages the Engaged Individual to perform certain services/work as mutually agreed, and the Engaged Individual agrees to perform such services under the terms of this Agreement.</p>
      <h3>2. Scope of Services</h3>
      <p>The Engaged Individual shall perform the following services:</p>
      <p>{{servicesDescription}}</p>
      <ul>
        <li>Perform services with due skill, care, and diligence.</li>
        <li>Follow reasonable instructions of the Company.</li>
        <li>Meet agreed timelines and quality standards.</li>
      </ul>
      <h3>3. Term</h3>
      <p>This Agreement shall commence on {{startDate}} and shall continue until {{termEndCondition}}.</p>
      <h3>4. Compensation &amp; Payment Terms</h3>
      <p>4.1 The Engaged Individual shall be paid: {{compensationModel}}</p>
      <p>4.2 Payment schedule: {{paymentSchedule}}</p>
      <p>4.3 Payments shall be made within {{paymentWindowDays}} days of invoice or milestone completion unless otherwise agreed.</p>
      <p>4.4 The Engaged Individual shall be solely responsible for taxes, duties, and statutory obligations relating to compensation.</p>
      <h3>5. Independent Engaged Individual Status</h3>
      <p>The Engaged Individual is an independent Engaged Individual and not an employee, partner, or agent of the Company. Nothing in this Agreement creates an employment relationship, partnership, joint venture, or agency.</p>
      <h3>6. Confidentiality</h3>
      <p>The Engaged Individual shall keep strictly confidential all non-public information received from the Company, including business and financial information, client and vendor data, trade secrets, and technical or operational information. This obligation survives termination.</p>
      <h3>7. Intellectual Property Rights</h3>
      <p>Unless otherwise agreed in writing, all work product, deliverables, inventions, materials, designs, documents, or results created under this Agreement shall become the exclusive property of the Company upon full payment. The Engaged Individual assigns all rights, title, and interest in such work to the Company.</p>
      <h3>8. Non-Disclosure &amp; Non-Use</h3>
      <ul>
        <li>Do not disclose Company information to third parties.</li>
        <li>Do not use Company information for personal benefit.</li>
        <li>Do not use Company information for competing activities.</li>
      </ul>
      <h3>9. Non-Solicitation</h3>
      <p>During the term and for {{nonSolicitMonths}} months after termination, the Engaged Individual shall not solicit Company clients or employees, induce termination of Company relationships, or divert business opportunities.</p>
      <h3>10. Representations &amp; Warranties</h3>
      <ul>
        <li>The Engaged Individual has the right and ability to perform the services.</li>
        <li>Services will not infringe third-party rights.</li>
        <li>Work will be original unless agreed otherwise.</li>
        <li>The Engaged Individual will comply with applicable laws.</li>
      </ul>
      <h3>11. Liability &amp; Indemnity</h3>
      <p>The Engaged Individual shall indemnify and hold harmless the Company from losses, damages, claims, or expenses arising from breach of this Agreement, negligence or misconduct, legal violations, and IP infringement. Except for wilful misconduct or fraud, neither Party shall be liable for indirect or consequential damages.</p>
      <h3>12. Limitation of Liability</h3>
      <p>To the maximum extent permitted by law, the Company’s total liability under this Agreement shall not exceed the total amount paid to the Engaged Individual.</p>
      <h3>13. Termination</h3>
      <p>13.1 Either Party may terminate this Agreement with {{noticePeriodDays}} days written notice.</p>
      <p>13.2 The Company may terminate immediately in case of breach of Agreement, misconduct or negligence, non-performance, confidentiality breach, or legal/reputational risk.</p>
      <p>13.3 Upon termination, the Engaged Individual shall cease work immediately, return all Company materials, and provide completed work.</p>
      <p>13.4 The Engaged Individual shall be paid for services properly performed up to the termination date.</p>
      <h3>14. Return of Property</h3>
      <p>Upon termination or request, the Engaged Individual shall return all Company property, documents, data, and materials.</p>
      <h3>15. Force Majeure</h3>
      <p>Neither Party shall be liable for failure or delay caused by events beyond reasonable control, including natural disasters, war, government actions, or infrastructure failures.</p>
      <h3>16. Assignment</h3>
      <p>The Engaged Individual shall not assign or subcontract obligations without prior written consent of the Company.</p>
      <h3>17. Amendment</h3>
      <p>Any modification to this Agreement must be in writing and signed by both Parties.</p>
      <h3>18. Waiver</h3>
      <p>Failure to enforce any provision shall not constitute waiver of that provision or future rights.</p>
      <h3>19. Severability</h3>
      <p>If any provision is held invalid or unenforceable, the remaining provisions shall remain in full force.</p>
      <h3>20. Notices</h3>
      <p>All notices under this Agreement shall be in writing and sent via email or registered post to the addresses of the Parties.</p>
      <h3>21. Governing Law &amp; Jurisdiction</h3>
      <p>This Agreement shall be governed by the laws of {{governingLaw}}. Courts of {{jurisdictionCity}} shall have exclusive jurisdiction.</p>
      <h3>22. Entire Agreement</h3>
      <p>This Agreement constitutes the entire understanding between the Parties and supersedes all prior agreements or communications.</p>
      <p><strong>For Corescent Technologies Pvt. Ltd.</strong></p>
      <p>Kushagra Sharma<br/>CEO &amp; MD</p>
      <p><strong>Engaged Individual</strong><br/>{{engagedIndividualName}}</p>
    `,
  },
  {
    id: 'internship-letter',
    name: 'Letter of Internship',
    category: 'HR',
    description: 'Official Corescent internship letter template with annexed terms and conditions.',
    isCustom: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
    fields: [
      { id: 'internFullName', name: 'internFullName', label: 'Intern Full Name', type: 'text', required: true, order: 1 },
      { id: 'internFirstName', name: 'internFirstName', label: 'Intern First Name', type: 'text', required: true, order: 2 },
      { id: 'addressLine1', name: 'addressLine1', label: 'Address Line 1', type: 'text', required: true, order: 3 },
      { id: 'addressLine2', name: 'addressLine2', label: 'Address Line 2', type: 'text', required: false, order: 4 },
      { id: 'addressLine3', name: 'addressLine3', label: 'Address Line 3', type: 'text', required: false, order: 5 },
      { id: 'letterDate', name: 'letterDate', label: 'Letter Date', type: 'text', required: true, order: 6 },
      { id: 'internshipReferenceNo', name: 'internshipReferenceNo', label: 'Internship Reference No.', type: 'text', required: true, order: 7 },
      { id: 'designation', name: 'designation', label: 'Designation / Role', type: 'text', required: true, order: 8 },
      { id: 'startDate', name: 'startDate', label: 'Internship Start Date', type: 'date', required: true, order: 9 },
      { id: 'endDate', name: 'endDate', label: 'Internship End Date', type: 'date', required: true, order: 10 },
      { id: 'mode', name: 'mode', label: 'Mode of Internship', type: 'select', required: true, order: 11, options: ['Remote', 'On-site', 'Hybrid'] },
      { id: 'internType', name: 'internType', label: 'Intern Type', type: 'select', required: true, order: 12, options: ['Paid', 'Unpaid'] },
      { id: 'stipendAmount', name: 'stipendAmount', label: 'Stipend Amount (INR)', type: 'number', required: true, order: 13 },
      { id: 'managerName', name: 'managerName', label: 'Reporting Manager Name', type: 'text', required: true, order: 14 },
      { id: 'managerDesignation', name: 'managerDesignation', label: 'Reporting Manager Designation', type: 'text', required: true, order: 15 },
      { id: 'internshipDuration', name: 'internshipDuration', label: 'Internship Duration', type: 'text', required: true, order: 16 },
      { id: 'probationDays', name: 'probationDays', label: 'Probation Days', type: 'number', required: true, order: 17 },
    ],
    template: `
      <p>{{internFullName}}<br/>{{addressLine1}}<br/>{{addressLine2}}<br/>{{addressLine3}}</p>
      <p>{{letterDate}}<br/>{{internshipReferenceNo}}</p>
      <p>Dear {{internFirstName}},</p>
      <p>Congratulations! Welcome to Corescent Technologies Pvt. Ltd.</p>
      <p>We are pleased to inform you that based on your interview and subsequent discussions, you have been selected for an Internship Program with Corescent Technologies ("Company" or "Corescent"). Your internship will be governed by the terms and conditions outlined in this letter and the annexure attached.</p>
      <p>The details of your internship are as follows:</p>
      <ul>
        <li><strong>Position:</strong> {{designation}}</li>
        <li><strong>Internship Start Date:</strong> {{startDate}}</li>
        <li><strong>Internship End Date:</strong> {{endDate}}</li>
        <li><strong>Mode of Internship:</strong> {{mode}}</li>
        <li><strong>Location:</strong> WeWork Latitude, 10th floor, RMZ Latitude, Hebbal, Bengaluru, Karnataka, 560024</li>
        <li><strong>Intern Type:</strong> {{internType}}</li>
        <li><strong>Stipend:</strong> INR {{stipendAmount}}/-</li>
        <li><strong>Reporting Manager:</strong> {{managerName}}, {{managerDesignation}}</li>
      </ul>
      <p>Please note that this internship does not assure full-time employment; however, a full-time role may be offered based on your performance. Kindly review the detailed terms and conditions outlined below. Your acceptance will be subject to signing and returning a copy of this offer letter and submitting the required documents.</p>
      <h2>Terms &amp; Conditions</h2>
      <h3>1. Duration and Probation</h3>
      <p>Your internship period is for {{internshipDuration}}. The first {{probationDays}} days shall be treated as a probationary period during which your performance, conduct, and suitability will be assessed. The Company reserves the right to terminate the internship during probation without prior notice if necessary. Any extension of your internship will be communicated in writing.</p>
      <h3>2. Stipend</h3>
      <p>The internship may be paid or unpaid based on the type offered to you. If paid, a monthly stipend will be credited to your bank account on the last day of each month, subject to satisfactory attendance and completion of required tasks. Stipend payments do not constitute salary, and no employment benefits will accrue.</p>
      <h3>3. Working Days and Hours</h3>
      <p>Working Days: Monday to Friday (Weekends off, unless otherwise required during project demands with prior notice). Working Hours: 8-9 hours per day. However, responsiveness to official communications during working hours is mandatory.</p>
      <h3>4. Leave Policy</h3>
      <p>You are entitled to 2 days of leave per month during your internship. Any leave taken without prior approval will result in a proportionate deduction from the monthly stipend, calculated on a per-day basis as per the working days of the month. Absence for more than 4 consecutive days without intimation will lead to automatic termination of your internship and no stipend will be released.</p>
      <h3>5. Certificate of Completion</h3>
      <p>Upon successful completion of the internship and fulfillment of all obligations, you will receive a Certificate of Internship acknowledging your contributions and achievements.</p>
      <h3>6. Code of Conduct</h3>
      <p>You are expected to adhere strictly to the company's professional code, including ethical behavior, mutual respect for colleagues, and compliance with organizational rules and legal standards. Misconduct, breach of trust, or unprofessional behavior can lead to immediate termination.</p>
      <h3>7. Confidentiality and NDA</h3>
      <p>Before commencement, you must sign a Non-Disclosure Agreement (NDA). You are expected to protect and not disclose any confidential, proprietary, or sensitive information during or after the internship. Unauthorized disclosure may result in legal action and immediate termination.</p>
      <h3>8. Intellectual Property</h3>
      <p>All works developed or created during your internship, such as ideas, inventions, software, documents, or designs, will be the sole property of Corescent Technologies. You agree to assign any rights to intellectual property created during your internship to the Company and not use any intellectual property outside the company without explicit written consent.</p>
      <h3>9. Conflict of Interest</h3>
      <p>You are prohibited from undertaking any freelance or external work without prior written approval and from engaging in activities or associations conflicting with the interests of Corescent Technologies. For one year post-internship, you agree not to solicit company employees, customers, or vendors for competing businesses.</p>
      <h3>10. IT Security and Data Privacy</h3>
      <p>You must comply with the Company's Information Security Policies, refrain from unauthorized installation or download of software or files, and handle company and client data in line with data protection regulations.</p>
      <h3>11. Use of Company Resources</h3>
      <p>All tools, assets, devices, or materials provided must be used only for official purposes. You are responsible for returning all assets on termination/completion of the internship. Failure to do so may result in recovery charges or legal action.</p>
      <h3>12. Termination of Internship</h3>
      <p>The Intern may terminate this internship by providing 7 days’ prior written notice to the Company. In case of voluntary termination without notice, stipend dues will be forfeited. The Company reserves the right to terminate the internship at any time without prior notice in the event of unsatisfactory performance, misconduct, unprofessional behavior, breach of company policies, or continued unavailability/non-responsiveness of the Intern with all relevant evidence documented and maintained by the Company.</p>
      <h3>13. Social Media Policy</h3>
      <p>Exercise discretion when posting on personal social media accounts. Sharing confidential company information without authorization is strictly prohibited and will be treated as a violation.</p>
      <p>Please sign and return a copy of this offer letter to confirm your acceptance of the internship terms and conditions.</p>
      <p><strong>For Corescent Technologies Pvt. Ltd.</strong><br/>Kushagra Sharma<br/>Authorized Signatory &amp; CEO</p>
      <p><strong>Acceptance by Candidate</strong><br/>I have read and understood the above terms and conditions of the Internship and further agree to abide by the same. I hereby affix my signature as a token of acceptance.</p>
      <p>Name: {{internFullName}}</p>
      <p>Signature:</p>
      <p>Date:</p>
    `,
  },
  {
    id: 'nda',
    name: 'Non-Disclosure Agreement',
    category: 'Legal',
    description: 'Official Corescent NDA template based on the approved company PDF.',
    isCustom: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
    fields: [
      { id: 'agreementDay', name: 'agreementDay', label: 'Agreement Day', type: 'text', required: true, order: 1 },
      { id: 'agreementMonth', name: 'agreementMonth', label: 'Agreement Month', type: 'text', required: true, order: 2 },
      { id: 'agreementYear', name: 'agreementYear', label: 'Agreement Year', type: 'text', required: true, order: 3 },
      { id: 'engagedIndividualName', name: 'engagedIndividualName', label: 'Engaged Individual Name', type: 'text', required: true, order: 4 },
      { id: 'address', name: 'address', label: 'Address', type: 'textarea', required: true, order: 5 },
      { id: 'state', name: 'state', label: 'State', type: 'text', required: true, order: 6 },
      { id: 'country', name: 'country', label: 'Country', type: 'text', required: true, order: 7 },
      { id: 'governingLawDate', name: 'governingLawDate', label: 'Agreement Date (DD/MM/YYYY)', type: 'text', required: true, order: 8 },
    ],
    template: `
      <p>This Agreement is made on this {{agreementDay}} day of {{agreementMonth}}, {{agreementYear}}</p>
      <h2>By and Between</h2>
      <p>Corescent Technologies, a company incorporated under the Companies Act, 2013, having its registered office at WeWork Latitude, 10th floor, RMZ Latitude, Hebbal, Bengaluru, Karnataka PIN-560024 (hereinafter referred to as the “Company”).</p>
      <p>AND</p>
      <p>Mr./Ms. {{engagedIndividualName}}, residing at {{address}}, {{state}}, {{country}} (hereinafter referred to as the “Engaged Individual”). The Company and the Engaged Individual shall collectively be referred to as the “Parties” and individually as a “Party”.</p>
      <h3>Whereas</h3>
      <ol>
        <li>The Company wishes to engage the Engaged Individual for certain assignments, tasks, or projects as may be mutually agreed.</li>
        <li>In the course of such engagement, the Engaged Individual may receive or have access to the Company’s confidential, proprietary, and sensitive information.</li>
        <li>The Company desires to protect such information, and the Engaged Individual acknowledges and agrees to maintain confidentiality.</li>
      </ol>
      <p>Now, therefore, in consideration of the engagement and access to Confidential Information, the Parties agree as follows:</p>
      <h3>1. Definition of Confidential Information</h3>
      <p>“Confidential Information” includes all non-public information disclosed by the Company to the Engaged Individual, whether in oral, written, electronic, visual, or any other form, including but not limited to business plans, strategies, pricing, financials; client information, vendor information, and communication; software, source code, algorithms, research, technical data; project details, documentation, internal processes, and systems; and any information that a reasonable person would understand as confidential. Confidential Information includes all copies, summaries, analyses, and derivative materials.</p>
      <h3>2. Obligations of the Engaged Individual</h3>
      <ul>
        <li>Maintain absolute confidentiality of the Company’s Confidential Information.</li>
        <li>Use such information solely for the purpose of performing agreed assignments or projects.</li>
        <li>Not disclose, share, or publish Confidential Information to any third party without prior written approval of the Company.</li>
        <li>Take reasonable measures to prevent unauthorized access or misuse.</li>
        <li>Immediately inform the Company of any breach or suspected breach.</li>
      </ul>
      <h3>3. Return or Destruction of Information</h3>
      <p>Upon completion or termination of the engagement, the Engaged Individual shall return all Company property, documents, devices, materials, or data, delete all Confidential Information stored on personal devices or systems, and certify compliance in writing if requested by the Company.</p>
      <h3>4. Exceptions to Confidentiality</h3>
      <p>Confidential Information does not include information that the Engaged Individual can prove is publicly available without breach of this Agreement, was lawfully known prior to joining the Company, was independently developed without using Company resources, or is required to be disclosed by law or court order, provided the Company is notified before disclosure.</p>
      <h3>5. Non-Disclosure, Non-Use, and Non-Solicitation</h3>
      <p>The Engaged Individual shall not directly or indirectly use Company information for any competing business activities. For 1 year after leaving the Company, the Engaged Individual shall not solicit the Company’s clients, Engaged Individuals, or contractors for competing purposes.</p>
      <h3>6. Remedies for Breach</h3>
      <p>The Engaged Individual acknowledges that any breach of this Agreement may cause irreparable harm to the Company. The Company shall be entitled to injunctive relief, recovery of damages, and legal and court costs.</p>
      <h3>7. Governing Law and Dispute Resolution</h3>
      <p>This Agreement is governed by the laws of India. Any disputes shall be resolved by arbitration under the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Bangalore, Karnataka, with proceedings in English.</p>
      <h3>8. No Assignment</h3>
      <p>The Engaged Individual may not assign or transfer any rights or obligations under this Agreement.</p>
      <h3>9. Entire Agreement</h3>
      <p>This document constitutes the entire understanding between the Parties regarding confidentiality. No oral modifications are valid unless made in writing and signed by both Parties.</p>
      <h3>10. Term</h3>
      <p>This Agreement remains effective throughout the Engaged Individual’s employment and continues for five (5) years after termination of employment.</p>
      <p>In witness whereof, the Parties have executed this Agreement as of the date mentioned above.</p>
      <p>Date: {{governingLawDate}}</p>
      <p><strong>For Corescent Technologies Pvt. Ltd.</strong><br/>Kushagra Sharma<br/>CEO &amp; MD</p>
      <p><strong>Engaged Individual</strong><br/>{{engagedIndividualName}}</p>
    `,
  },
];
