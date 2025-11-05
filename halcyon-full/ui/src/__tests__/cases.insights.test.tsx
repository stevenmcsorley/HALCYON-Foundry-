import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CaseInsights from '../modules/cases/CaseInsights';
import { useCasesStore } from '../store/casesStore';
import * as auth from '../services/auth';

// Mock dependencies
vi.mock('../store/casesStore');
vi.mock('../services/auth');
vi.mock('../components/Toast', () => ({
  showToast: vi.fn(),
}));

describe('CaseInsights', () => {
  const mockCase = {
    id: 1,
    title: 'Test Case',
    status: 'open' as const,
    priority: 'medium' as const,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    prioritySuggestion: 'high',
    ownerSuggestion: 'alice@example.com',
    similarCaseIds: [2, 3],
    mlVersion: '1.0.0',
  };

  const mockAdoptPriority = vi.fn().mockResolvedValue({ ...mockCase, priority: 'high' });
  const mockAdoptOwner = vi.fn().mockResolvedValue({ ...mockCase, owner: 'alice@example.com' });
  const mockGet = vi.fn().mockResolvedValue(mockCase);

  beforeEach(() => {
    vi.clearAllMocks();
    (useCasesStore as any).mockReturnValue({
      adoptPriority: mockAdoptPriority,
      adoptOwner: mockAdoptOwner,
      get: mockGet,
    });
  });

  it('renders insights panel with suggestions', () => {
    (auth.hasRole as any).mockReturnValue(true);
    
    const { container } = render(
      <CaseInsights caseData={mockCase} onUpdate={vi.fn()} />
    );
    
    expect(screen.getByText('Insights (AI)')).toBeInTheDocument();
    expect(screen.getByText('Suggested Priority')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Suggested Owner')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows adopt buttons for analyst/admin', () => {
    (auth.hasRole as any).mockReturnValue(true);
    
    render(<CaseInsights caseData={mockCase} onUpdate={vi.fn()} />);
    
    const adoptButtons = screen.getAllByText(/Adopt/);
    expect(adoptButtons.length).toBeGreaterThan(0);
  });

  it('hides adopt buttons for viewer', () => {
    (auth.hasRole as any).mockReturnValue(false);
    
    render(<CaseInsights caseData={mockCase} onUpdate={vi.fn()} />);
    
    const adoptButtons = screen.queryAllByText(/Adopt/);
    expect(adoptButtons.length).toBe(0);
  });

  it('calls adoptPriority when priority adopt button is clicked', async () => {
    (auth.hasRole as any).mockReturnValue(true);
    const mockOnUpdate = vi.fn();
    
    render(<CaseInsights caseData={mockCase} onUpdate={mockOnUpdate} />);
    
    const adoptButton = screen.getByText('Adopt');
    fireEvent.click(adoptButton);
    
    await waitFor(() => {
      expect(mockAdoptPriority).toHaveBeenCalledWith(1);
    });
  });

  it('renders related cases as clickable badges', () => {
    (auth.hasRole as any).mockReturnValue(true);
    
    render(<CaseInsights caseData={mockCase} onUpdate={vi.fn()} />);
    
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('does not render if no suggestions', () => {
    const caseWithoutSuggestions = {
      ...mockCase,
      prioritySuggestion: null,
      ownerSuggestion: null,
      similarCaseIds: [],
    };
    
    const { container } = render(
      <CaseInsights caseData={caseWithoutSuggestions} onUpdate={vi.fn()} />
    );
    
    expect(container.firstChild).toBeNull();
  });
});

