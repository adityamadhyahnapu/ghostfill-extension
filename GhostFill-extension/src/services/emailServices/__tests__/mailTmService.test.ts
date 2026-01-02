import { MailTmService } from '../mailTmService';
import { API } from '../../../utils/constants';

// Mock dependencies
jest.mock('../../cryptoService', () => ({
    cryptoService: {
        getRandomString: jest.fn(() => 'teststring'),
    },
}));

jest.mock('../../storageService', () => ({
    storageService: {
        get: jest.fn(),
        set: jest.fn(),
    },
}));

jest.mock('../../../utils/logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('MailTmService', () => {
    let mailTmService: MailTmService;

    beforeEach(() => {
        jest.resetAllMocks();
        mailTmService = new MailTmService();
    });

    describe('getDomains', () => {
        it('should fetch available domains', async () => {
            const mockDomains = [
                { domain: 'example.com', isActive: true, isPrivate: false },
                { domain: 'test.com', isActive: true, isPrivate: false },
            ];

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ 'hydra:member': mockDomains }),
            });

            const domains = await mailTmService.getDomains();
            expect(domains).toEqual(['example.com', 'test.com']);
            expect(global.fetch).toHaveBeenCalledWith(`${API.MAIL_TM.BASE_URL}${API.MAIL_TM.ENDPOINTS.DOMAINS}`, {});
        });

        it('should handle API errors', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 400,
            });

            const domains = await mailTmService.getDomains();
            expect(domains).toEqual(['bugfoo.com', 'karenkey.com']);
        });
    });

    describe('authenticate', () => {
        it('should authenticate and store token', async () => {
            const mockToken = 'mock-jwt-token';
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: mockToken }),
            });

            const token = await mailTmService.authenticate('test@example.com', 'password');

            expect(token).toBe(mockToken);
            expect(mailTmService.isAuthenticated()).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                `${API.MAIL_TM.BASE_URL}${API.MAIL_TM.ENDPOINTS.TOKEN}`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ address: 'test@example.com', password: 'password' }),
                })
            );
        });
    });

    describe('createAccount', () => {
        it('should create an account and authenticate', async () => {
            // Mock getDomains
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ // getDomains
                    ok: true,
                    json: async () => ({ 'hydra:member': [{ domain: 'example.com', isActive: true, isPrivate: false }] }),
                })
                .mockResolvedValueOnce({ // createAccount
                    ok: true,
                    json: async () => ({ address: 'teststring@example.com', id: '123' }),
                })
                .mockResolvedValueOnce({ // authenticate
                    ok: true,
                    json: async () => ({ token: 'mock-token' }),
                });

            const account = await mailTmService.createAccount();

            expect(account.fullEmail).toBe('teststring@example.com');
            expect(account.service).toBe('mailtm');
            expect(mailTmService.isAuthenticated()).toBe(true);
        });
    });
});
