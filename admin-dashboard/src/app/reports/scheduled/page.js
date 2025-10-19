'use client';

import { useState, useEffect } from 'react';
import ExportButton from '../../../components/ExportButton';

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    reportType: 'financial-overview',
    frequency: 'weekly',
    dayOfWeek: '1', // Monday
    dayOfMonth: '1',
    time: '09:00',
    recipients: '',
    isActive: true
  });

  // Mock data for demonstration
  useEffect(() => {
    setSchedules([
      {
        id: 1,
        name: 'Weekly Financial Summary',
        reportType: 'financial-overview',
        frequency: 'weekly',
        dayOfWeek: 1,
        time: '09:00',
        recipients: 'admin@bedtexture.com, finance@bedtexture.com',
        isActive: true,
        lastRun: '2025-01-15T09:00:00Z',
        nextRun: '2025-01-22T09:00:00Z'
      },
      {
        id: 2,
        name: 'Monthly Tax Report',
        reportType: 'tax-collection',
        frequency: 'monthly',
        dayOfMonth: 1,
        time: '08:00',
        recipients: 'accounting@bedtexture.com',
        isActive: true,
        lastRun: '2025-01-01T08:00:00Z',
        nextRun: '2025-02-01T08:00:00Z'
      }
    ]);
  }, []);

  const handleCreateSchedule = (e) => {
    e.preventDefault();
    const schedule = {
      id: Date.now(),
      ...newSchedule,
      recipients: newSchedule.recipients,
      lastRun: null,
      nextRun: calculateNextRun(newSchedule)
    };
    
    setSchedules([...schedules, schedule]);
    setNewSchedule({
      name: '',
      reportType: 'financial-overview',
      frequency: 'weekly',
      dayOfWeek: '1',
      dayOfMonth: '1',
      time: '09:00',
      recipients: '',
      isActive: true
    });
    setShowCreateForm(false);
  };

  const calculateNextRun = (schedule) => {
    const now = new Date();
    let nextRun = new Date();
    
    if (schedule.frequency === 'weekly') {
      const dayOfWeek = parseInt(schedule.dayOfWeek);
      const daysUntilNext = (dayOfWeek - now.getDay() + 7) % 7;
      nextRun.setDate(now.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext));
    } else if (schedule.frequency === 'monthly') {
      const dayOfMonth = parseInt(schedule.dayOfMonth);
      nextRun.setMonth(now.getMonth() + 1);
      nextRun.setDate(dayOfMonth);
    }
    
    const [hours, minutes] = schedule.time.split(':');
    nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    return nextRun.toISOString();
  };

  const toggleScheduleStatus = (id) => {
    setSchedules(schedules.map(schedule => 
      schedule.id === id 
        ? { ...schedule, isActive: !schedule.isActive }
        : schedule
    ));
  };

  const deleteSchedule = (id) => {
    if (confirm('Are you sure you want to delete this scheduled report?')) {
      setSchedules(schedules.filter(schedule => schedule.id !== id));
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getReportTypeLabel = (type) => {
    const labels = {
      'financial-overview': 'Financial Overview',
      'revenue-analytics': 'Revenue Analytics',
      'tax-collection': 'Tax Collection',
      'payment-analytics': 'Payment Analytics'
    };
    return labels[type] || type;
  };

  const getFrequencyLabel = (frequency) => {
    const labels = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'monthly': 'Monthly'
    };
    return labels[frequency] || frequency;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scheduled Reports</h1>
          <p className="text-gray-600 mt-1">Automate report generation and delivery</p>
        </div>
        
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Schedule
        </button>
      </div>

      {/* Create Schedule Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Scheduled Report</h3>
          <form onSubmit={handleCreateSchedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Report Name
                </label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Report Type
                </label>
                <select
                  value={newSchedule.reportType}
                  onChange={(e) => setNewSchedule({ ...newSchedule, reportType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="financial-overview">Financial Overview</option>
                  <option value="revenue-analytics">Revenue Analytics</option>
                  <option value="tax-collection">Tax Collection</option>
                  <option value="payment-analytics">Payment Analytics</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <select
                  value={newSchedule.frequency}
                  onChange={(e) => setNewSchedule({ ...newSchedule, frequency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              
              {newSchedule.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={newSchedule.dayOfWeek}
                    onChange={(e) => setNewSchedule({ ...newSchedule, dayOfWeek: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                </div>
              )}
              
              {newSchedule.frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Month
                  </label>
                  <select
                    value={newSchedule.dayOfMonth}
                    onChange={(e) => setNewSchedule({ ...newSchedule, dayOfMonth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={newSchedule.time}
                  onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Recipients (comma-separated)
                </label>
                <input
                  type="text"
                  value={newSchedule.recipients}
                  onChange={(e) => setNewSchedule({ ...newSchedule, recipients: e.target.value })}
                  placeholder="admin@bedtexture.com, finance@bedtexture.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Create Schedule
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scheduled Reports List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Active Schedules</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Report Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipients
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {schedule.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getReportTypeLabel(schedule.reportType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getFrequencyLabel(schedule.frequency)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {schedule.recipients}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(schedule.lastRun)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(schedule.nextRun)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      schedule.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {schedule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleScheduleStatus(schedule.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {schedule.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Export Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Export</h3>
        <p className="text-gray-600 mb-4">Generate and download reports immediately</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ExportButton
            endpoint="/admin/reports/export/financial-overview"
            filename={`financial-overview-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
          >
            Financial Overview
          </ExportButton>
          
          <ExportButton
            endpoint="/admin/reports/export/revenue-analytics"
            filename={`revenue-analytics-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: '30days', granularity: 'day' }}
            className="w-full justify-center"
            variant="secondary"
          >
            Revenue Analytics
          </ExportButton>
          
          <ExportButton
            endpoint="/admin/reports/export/tax-collection"
            filename={`tax-collection-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
            variant="success"
          >
            Tax Collection
          </ExportButton>
          
          <ExportButton
            endpoint="/admin/reports/export/payment-analytics"
            filename={`payment-analytics-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
            variant="secondary"
          >
            Payment Analytics
          </ExportButton>
        </div>
      </div>
    </div>
  );
}