// @flow
import API from '../apis.js'
import type { Recipient } from '../types/transfer.flow.js'
import type { UserProfile } from '../types/user.flow.js'
import { enqueueSnackbar } from './notificationActions.js'
import { getCryptoAccounts } from './accountActions'
import { updateTransferForm } from '../actions/formActions'
import update from 'immutability-helper'
import { getWallet, deleteWallet } from '../drive.js'
import { createCloudWallet, clearCloudWalletCryptoAccounts } from './walletActions'
import moment from 'moment'

function clearError () {
  return { type: 'CLEAR_ERROR' }
}

function onGoogleLoginReturn (loginData: any) {
  return (dispatch: Function, getState: Function) => {
    const currentTimestamp = moment().unix()
    loginData = { ...loginData, lastLoginTimestamp: currentTimestamp }
    dispatch({
      type: 'ON_GOOGLE_LOGIN_RETURN',
      payload: loginData
    })
  }
}

function register (idToken: string, userProfile: UserProfile) {
  return {
    type: 'REGISTER',
    payload: API.register(idToken, userProfile)
  }
}

async function _onLogout (disconnect?: boolean, deleteAppDataFolder?: boolean) {
  if (window.gapi && window.gapi.auth2) {
    let googleAuth = await window.gapi.auth2.getAuthInstance()
    if (googleAuth && googleAuth.isSignedIn.get()) {
      if (disconnect) {
        if (deleteAppDataFolder) await deleteWallet()
        await googleAuth.disconnect()
      }
      await googleAuth.signOut()
    }
  }
}

function onLogout (disconnect?: boolean, deleteAppDataFolder?: boolean) {
  return {
    type: 'LOGOUT',
    payload: _onLogout(disconnect, deleteAppDataFolder)
  }
}

function setNewUserTag (isNewUser: boolean) {
  return {
    type: 'SET_NEW_USER_TAG',
    payload: isNewUser
  }
}

async function _getRecipients (idToken: string) {
  let recipients = await API.getRecipients({ idToken })
  recipients = await Promise.all(
    recipients.map(async recipient => {
      try {
        const recipientProfile = await API.getUserProfileByEmail(recipient.email)
        return { ...recipient, imageUrl: recipientProfile.imageUrl }
      } catch (e) {
        console.warn(e.message)
        return recipient
      }
    })
  )
  return recipients
}

function getRecipients () {
  return (dispatch: Function, getState: Function) => {
    const { idToken } = getState().userReducer.profile
    return dispatch({
      type: 'GET_RECIPIENTS',
      payload: _getRecipients(idToken)
    })
  }
}

function addRecipient (recipient: Recipient) {
  return (dispatch: Function, getState: Function) => {
    const { idToken } = getState().userReducer.profile
    const { transferForm } = getState().formReducer
    const { recipients } = getState().userReducer
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      if (r.email === recipient.email) {
        return dispatch(
          enqueueSnackbar({
            message: 'Recipient already exists.',
            key: new Date().getTime() + Math.random(),
            options: { variant: 'error', autoHideDuration: 3000 }
          })
        )
      }
    }
    return dispatch({
      type: 'ADD_RECIPIENT',
      payload: API.addRecipient({ idToken, recipient })
    }).then(() => {
      dispatch(
        enqueueSnackbar({
          message: 'Recipient added successfully.',
          key: new Date().getTime() + Math.random(),
          options: { variant: 'info', autoHideDuration: 3000 }
        })
      )
      dispatch(
        updateTransferForm(
          update(transferForm, {
            destination: { $set: recipient.email },
            receiverName: { $set: recipient.name },
            formError: { destination: { $set: null } }
          })
        )
      )
    })
  }
}

function editRecipient (oldRecipient: Recipient, newRecipient: Recipient) {
  return (dispatch: Function, getState: Function) => {
    const { idToken } = getState().userReducer.profile
    return dispatch({
      type: 'EDIT_RECIPIENT',
      payload: async () => {
        await API.removeRecipient({ idToken, recipient: oldRecipient })
        const result = await API.addRecipient({ idToken, recipient: newRecipient })
        return result
      }
    }).then(() => {
      dispatch(
        enqueueSnackbar({
          message: 'Recipient modified successfully.',
          key: new Date().getTime() + Math.random(),
          options: { variant: 'info', autoHideDuration: 3000 }
        })
      )
    })
  }
}

function removeRecipient (recipient: Recipient) {
  return (dispatch: Function, getState: Function) => {
    const { idToken } = getState().userReducer.profile
    return dispatch({
      type: 'REMOVE_RECIPIENT',
      payload: API.removeRecipient({ idToken, recipient })
    }).then(() => {
      dispatch(
        enqueueSnackbar({
          message: 'Recipient removed successfully.',
          key: new Date().getTime() + Math.random(),
          options: { variant: 'info', autoHideDuration: 3000 }
        })
      )
    })
  }
}

function setCoinbaseAccessObject (accessObject: Object) {
  return {
    type: 'SET_COINBASE_ACCESS_OBJECT',
    payload: accessObject
  }
}

async function _getUserCloudWalletFolderMeta () {
  const meta = await API.getUserCloudWalletFolderMeta()
  return meta
}

function getUserCloudWalletFolderMeta () {
  return {
    type: 'GET_UESR_CLOUD_WALLET_FOLDER_META',
    payload: _getUserCloudWalletFolderMeta()
  }
}

async function _getUserRegisterTime () {
  const date = await API.getUserRegisterTime()
  return date
}

function getUserRegisterTime () {
  return {
    type: 'GET_USER_JOIN_DATE',
    payload: _getUserRegisterTime()
  }
}

function postLoginPreparation (loginData: any, progress?: Function) {
  return (dispatch: Function, getState: Function) => {
    const { idToken, profileObj } = loginData
    dispatch(onGoogleLoginReturn(loginData))
    return dispatch({
      type: 'POST_LOGIN_PREPARATION',
      payload: new Promise(async (resolve, reject) => {
        // register/get user
        const userMetaInfo = (await dispatch(register(idToken, profileObj))).value
        const chainfrWalletFile = await getWallet()
        if (!chainfrWalletFile) {
          const { masterKey } = userMetaInfo
          // delete old cloud wallet accounts from backend
          await dispatch(clearCloudWalletCryptoAccounts())
          // if chainfr wallet file does not exist
          // create
          await dispatch(createCloudWallet(masterKey))
        }
        await dispatch(getCryptoAccounts())
        resolve()
      })
    })
  }
}

export {
  clearError,
  register,
  onGoogleLoginReturn,
  onLogout,
  setNewUserTag,
  getRecipients,
  addRecipient,
  removeRecipient,
  editRecipient,
  setCoinbaseAccessObject,
  getUserCloudWalletFolderMeta,
  getUserRegisterTime,
  postLoginPreparation
}
