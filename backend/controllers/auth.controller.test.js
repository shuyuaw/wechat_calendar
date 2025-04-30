// backend/controllers/auth.controller.test.js

// Import the function to test
const { loginUser } = require('./auth.controller');

// Mock dependencies
const axios = require('axios');
const db = require('../database.js'); // Path to your database module

// Tell Jest to mock these modules
jest.mock('axios');
jest.mock('../database.js', () => ({ // Mock the db object and its methods
  get: jest.fn(),
  run: jest.fn(),
}));

// Setup mock environment variables
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';

describe('Auth Controller - loginUser', () => {
  let mockReq;
  let mockRes;

  // Reset mocks and request/response objects before each test
  beforeEach(() => {
    jest.clearAllMocks(); // Clear previous calls to mocks

    mockReq = {
      body: {}, // Request body will be set in each test
    };
    mockRes = {
      status: jest.fn().mockReturnThis(), // Mock status and make it chainable (returns mockRes)
      json: jest.fn(), // Mock json function
    };
  });

  // Test Case 1: Successful login - New User
  test('should return 200 and openid when login is successful for a new user', async () => {
    // Arrange
    mockReq.body.code = 'valid-test-code';
    const mockOpenid = 'new-user-openid';
    const mockSessionKey = 'session-key';
    const mockWeChatResponse = { data: { openid: mockOpenid, session_key: mockSessionKey } };
    axios.get.mockResolvedValue(mockWeChatResponse); // Mock axios successful response

    // Mock db.get finding no user (calls callback with null error, null row)
    db.get.mockImplementation((sql, params, callback) => {
      callback(null, null);
    });

    // Mock db.run for inserting user succeeding (calls callback with null error)
    db.run.mockImplementation((sql, params, callback) => {
      callback(null);
    });

    // Act
    await loginUser(mockReq, mockRes);

    // Assert
    expect(axios.get).toHaveBeenCalledTimes(1); // Check axios was called
    expect(db.get).toHaveBeenCalledTimes(1); // Check db.get was called
    expect(db.run).toHaveBeenCalledTimes(1); // Check db.run was called (for insert)
    expect(mockRes.status).toHaveBeenCalledWith(200); // Check status code
    expect(mockRes.json).toHaveBeenCalledWith({ openid: mockOpenid }); // Check response body
  });

  // Test Case 2: Successful login - Existing User
  test('should return 200 and openid when login is successful for an existing user', async () => {
    // Arrange
    mockReq.body.code = 'valid-test-code';
    const mockOpenid = 'existing-user-openid';
    const mockSessionKey = 'session-key';
    const mockWeChatResponse = { data: { openid: mockOpenid, session_key: mockSessionKey } };
    axios.get.mockResolvedValue(mockWeChatResponse); // Mock axios success

    // Mock db.get finding the user (calls callback with null error, user data)
    db.get.mockImplementation((sql, params, callback) => {
      callback(null, { userId: mockOpenid }); // Simulate finding the user row
    });

    // Act
    await loginUser(mockReq, mockRes);

    // Assert
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(db.get).toHaveBeenCalledTimes(1);
    expect(db.run).not.toHaveBeenCalled(); // Ensure db.run (insert) was NOT called
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({ openid: mockOpenid });
  });

  // Test Case 3: Failure - Missing code
  test('should return 400 if login code is missing', async () => {
    // Arrange
    // mockReq.body is empty by default from beforeEach

    // Act
    await loginUser(mockReq, mockRes);

    // Assert
    expect(axios.get).not.toHaveBeenCalled(); // Axios should not be called
    expect(db.get).not.toHaveBeenCalled(); // DB should not be called
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Login code is required.' });
  });

  // Test Case 4: Failure - WeChat API returns error
  test('should return 400 if WeChat API returns an error', async () => {
    // Arrange
    mockReq.body.code = 'invalid-test-code';
    const mockWeChatError = { data: { errcode: 40029, errmsg: 'invalid code' } };
    axios.get.mockResolvedValue(mockWeChatError); // Mock axios returning WeChat error object

    // Act
    await loginUser(mockReq, mockRes);

    // Assert
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(db.get).not.toHaveBeenCalled(); // DB check shouldn't happen if WeChat fails
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'WeChat API Error: invalid code' });
  });

   // Test Case 5: Failure - Database error during user check
   test('should return 500 if database check fails', async () => {
    // Arrange
    mockReq.body.code = 'valid-test-code';
    const mockOpenid = 'any-openid';
    const mockSessionKey = 'session-key';
    const mockWeChatResponse = { data: { openid: mockOpenid, session_key: mockSessionKey } };
    axios.get.mockResolvedValue(mockWeChatResponse); // Mock axios success

    // Mock db.get calling back with an error
    db.get.mockImplementation((sql, params, callback) => {
      callback(new Error('DB connection lost'));
    });

    // Act
    await loginUser(mockReq, mockRes);

    // Assert
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(db.get).toHaveBeenCalledTimes(1);
    expect(db.run).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Database error checking user.' });
   });

  // Add more tests for other scenarios (DB insert error, axios network error, missing env vars etc.)

});